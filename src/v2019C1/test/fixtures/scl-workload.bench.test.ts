/// <reference types="@vitest/browser-playwright" />
import { generateSclWorkload } from './generate-scl-workload'

import { Project } from '@dialecte/core'
import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'
import { importTypes } from '@/v2019C1/extensions/data-model/transaction/import-types'
import { HOOKS, createSclIoHooks } from '@/v2019C1/hooks'

import type { SclWorkloadParams, SclWorkloadStats } from './generate-scl-workload'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type { Perf, PerfReport } from '@dialecte/core'

/**
 * SCL workload benchmarks for the S-IED implementation paths: import, query/read, and
 * transaction/write on a large synthetic SCL project. Measures only: there are NO timing
 * thresholds, a run never fails on speed (it only fails when a benchmark stops exercising the
 * instrumented code, see `EXPECTED_SPANS`).
 *
 * Two vitest projects run this file (see `vitest.config.ts`):
 * - `perf`: real Chromium + IndexedDB, both stores, `browser` sizes.
 * - `perf-node`: in-memory store only, but reaches the larger `node` sizes.
 *
 * Gated by `--mode bench` (or VITE_BENCH=1) so the normal suite / CI skips the heavy runs:
 *
 *   npm run test:perf                # installed @dialecte/core
 *   npm run test:perf:local-core     # locally built ../reference-core (build it first)
 *   npm run test:perf:profile        # + CDP CPU self-time for the write scenarios (browser only)
 *   VITE_BENCH_TIMEOUT_MS=60000 npm run test:perf   # per-scenario cap (default 180000)
 *
 * All timing goes through core's dev perf helper (`project.perf`, see core's `dev-perf` guide): each
 * scenario is a `bench::` span next to the `core::` / `scl::` spans core instruments itself, and
 * `perf.report()` is the only data source. `perf.reset()` between scenarios gives each its own
 * breakdown.
 *
 * Read scenarios run once "cold" (the first run after the import, whatever the store has cached
 * by then) and then {@link WARM_REPEATS} more times; the median of those is the "warm" figure. Write
 * scenarios mutate the document, so they run once.
 *
 * Read the `[PERF]` lines from the console. `[PERF-JSON]` carries the per-scenario reports in one
 * machine-readable line for pasting into a baseline.
 */
const RUN = import.meta.env.MODE === 'bench' || import.meta.env.VITE_BENCH === '1'

const IS_BROWSER = typeof indexedDB !== 'undefined'
const RUNTIME: Runtime = IS_BROWSER ? 'browser' : 'node'
const LOCAL_CORE = import.meta.env.VITE_BENCH_LOCAL_CORE === '1'
const PROFILE = import.meta.env.VITE_BENCH_PROFILE === '1' && IS_BROWSER
// Per-scenario budget. A dev guard against hanging on an O(N^2) regression, not a product SLA.
const CAP_MS = Number(import.meta.env.VITE_BENCH_TIMEOUT_MS) || 180_000
const WARM_REPEATS = 5
const ADD_CHILD_COUNT = 500
const IMPORT_TYPES_LNODES = 1_000

const SCL_HOOKS = { ...createSclIoHooks(), ...HOOKS }
type SclModules = typeof SCL_EXTENSION_MODULES
type Storage = 'inMemory' | 'local'
type Runtime = 'browser' | 'node'

type Size = {
	label: string
	params: SclWorkloadParams
	runtime: Runtime
	storages: Storage[]
	/** Fixed write batch sizes (not tied to the fixture size) so runs stay bounded and comparable. */
	updateCounts: number[]
}

const SIZES: Size[] = [
	{
		label: 'small',
		runtime: 'browser',
		storages: ['inMemory', 'local'],
		updateCounts: [50, 200],
		params: { ieds: 20, ldevicesPerIed: 4, lnsPerLdevice: 25, bays: 20 },
	},
	{
		label: 'medium',
		runtime: 'browser',
		storages: ['inMemory', 'local'],
		updateCounts: [50, 200],
		params: { ieds: 100, ldevicesPerIed: 4, lnsPerLdevice: 25, bays: 50 },
	},
	// IndexedDB import of the large fixture exceeds the per-scenario cap, so it runs in memory only.
	{
		label: 'large',
		runtime: 'browser',
		storages: ['inMemory'],
		updateCounts: [50, 200],
		params: { ieds: 400, ldevicesPerIed: 4, lnsPerLdevice: 25, bays: 100 },
	},
	{
		label: 'large',
		runtime: 'node',
		storages: ['inMemory'],
		updateCounts: [50, 200],
		params: { ieds: 400, ldevicesPerIed: 4, lnsPerLdevice: 25, bays: 100 },
	},
	{
		label: 'xlarge',
		runtime: 'node',
		storages: ['inMemory'],
		updateCounts: [50],
		params: { ieds: 1_000, ldevicesPerIed: 4, lnsPerLdevice: 25, bays: 150 },
	},
]

/**
 * Spans a scenario must produce. If core or scl stops instrumenting an op, or a scenario stops
 * reaching it, the run fails instead of silently reporting a hollow number. Reads are not
 * instrumented by core, so they declare none.
 */
const EXPECTED_SPANS = {
	import: ['core::import', 'core::import::sax'],
	write: ['core::commit'],
	importTypes: ['scl::importTypes'],
	read: [],
} as const
type ScenarioKind = keyof typeof EXPECTED_SPANS

type ProfileRow = { fn: string; selfMs: number }
type Scenario = {
	name: string
	/** The first (cold) run's perf report: `bench::<name>` is its wall time. */
	report: PerfReport
	/** Wall times of the repeated runs (reads only). */
	warmMs?: number[]
	profile?: ProfileRow[]
}
type RunResult = {
	size: string
	storage: Storage
	runtime: Runtime
	localCore: boolean
	stats: SclWorkloadStats
	scenarios: Scenario[]
	/** Name of the scenario that exceeded the cap; later scenarios were skipped. */
	capped?: string
}
const RESULTS: RunResult[] = []

class CapError extends Error {}

function withCap<GenericResult>(label: string, p: Promise<GenericResult>): Promise<GenericResult> {
	let timer: ReturnType<typeof setTimeout>
	const cap = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new CapError(`cap ${CAP_MS / 1000}s exceeded: ${label}`)),
			CAP_MS,
		)
	})
	return Promise.race([p, cap]).finally(() => clearTimeout(timer!)) as Promise<GenericResult>
}

async function timed(perf: Perf, name: string, fn: () => Promise<unknown>): Promise<PerfReport> {
	perf.reset()
	perf.start(`bench::${name}`)
	try {
		await withCap(name, fn())
	} finally {
		perf.stop(`bench::${name}`)
	}
	return perf.report()
}

/** CPU self-time per function over `fn`, via the CDP profiler (wall time includes awaits, this does not). */
async function profiled(fn: () => Promise<void>): Promise<ProfileRow[]> {
	const { cdp } = await import('vitest/browser')
	const session = cdp()
	await session.send('Profiler.enable')
	await session.send('Profiler.start')
	await fn()
	const { profile } = await session.send('Profiler.stop')

	const frames = new Map(profile.nodes.map((node) => [node.id, node.callFrame]))
	const selfUs = new Map<string, number>()
	profile.samples?.forEach((nodeId, index) => {
		const frame = frames.get(nodeId)
		if (!frame) return
		const key = `${frame.functionName || '(anonymous)'} ${frame.url.split('/').pop() ?? ''}:${frame.lineNumber + 1}`
		selfUs.set(key, (selfUs.get(key) ?? 0) + (profile.timeDeltas?.[index] ?? 0))
	})
	return [...selfUs.entries()]
		.map(([fn, us]) => ({ fn, selfMs: us / 1000 }))
		.sort((a, b) => b.selfMs - a.selfMs)
		.slice(0, 8)
}

function assertInstrumented(name: string, kind: ScenarioKind, report: PerfReport): void {
	const missing = EXPECTED_SPANS[kind].filter((span) => !(span in report))
	if (missing.length > 0) {
		throw new Error(
			`Instrumentation missing for "${name}": ${missing.join(', ')} never appeared. ` +
				`The op lost its perf spans, or the scenario no longer exercises it.`,
		)
	}
}

type MeasureOptions = { kind: ScenarioKind; warmRepeats?: number; profile?: boolean }

async function measure(
	perf: Perf,
	scenarios: Scenario[],
	name: string,
	fn: () => Promise<unknown>,
	{ kind, warmRepeats = 0, profile = false }: MeasureOptions,
): Promise<void> {
	let report: PerfReport = {}
	let rows: ProfileRow[] | undefined
	if (profile && PROFILE) {
		rows = await profiled(async () => {
			report = await timed(perf, name, fn)
		})
	} else {
		report = await timed(perf, name, fn)
	}
	assertInstrumented(name, kind, report)
	const scenario: Scenario = { name, report, profile: rows }

	if (warmRepeats > 0) {
		const warmMs: number[] = []
		for (let i = 0; i < warmRepeats; i++) {
			warmMs.push((await timed(perf, name, fn))[`bench::${name}`].totalMs)
		}
		scenario.warmMs = warmMs
	}
	scenarios.push(scenario)
}

async function runWorkload(
	size: string,
	params: SclWorkloadParams,
	storage: Storage,
	updateCounts: number[],
): Promise<RunResult> {
	const { xml, stats } = generateSclWorkload(params)
	const project = await new Project<Config, SclModules>({
		configs: { default: SCL_DIALECTE_CONFIG },
		defaultConfigKey: 'default',
		storage: storage === 'local' ? { type: 'local' } : { type: 'inMemory' },
		extensions: { base: SCL_EXTENSION_MODULES },
		hooks: SCL_HOOKS,
		dev: { perf: true },
	}).open(`scl-workload-${storage}-${crypto.randomUUID()}`)

	const perf = project.perf
	const scenarios: Scenario[] = []
	const result: RunResult = {
		size,
		storage,
		runtime: RUNTIME,
		localCore: LOCAL_CORE,
		stats,
		scenarios,
	}
	try {
		let documentId = ''
		await measure(
			perf,
			scenarios,
			'import',
			async () => {
				const [imported] = await project.import([
					new File([xml], 'workload.scd', { type: 'text/xml' }),
				])
				documentId = imported.documentId
			},
			{ kind: 'import' },
		)
		const doc = project.openDocument(documentId)

		// Read paths: the same shapes the extension's services use.
		const read = { kind: 'read', warmRepeats: WARM_REPEATS } as const
		let lnodes: Awaited<ReturnType<typeof doc.query.getRecordsByTagName<'LNode'>>> = []
		await measure(
			perf,
			scenarios,
			'query: getRecordsByTagName(LNode)',
			async () => {
				lnodes = await doc.query.getRecordsByTagName('LNode')
			},
			read,
		)
		await measure(
			perf,
			scenarios,
			'query: getAttributes per LNode',
			async () => {
				for (const lnode of lnodes) await doc.query.getAttributes(lnode)
			},
			read,
		)
		await measure(
			perf,
			scenarios,
			'query: getRecordsByTagName(IED) + getAttributes',
			async () => {
				const ieds = await doc.query.getRecordsByTagName('IED')
				for (const ied of ieds) await doc.query.getAttributes(ied)
			},
			read,
		)
		await measure(
			perf,
			scenarios,
			'query: findDescendants(first IED, LN)',
			async () => {
				const [firstIed] = await doc.query.getRecordsByTagName('IED')
				await doc.query.findDescendants(firstIed, { collect: 'LN' })
			},
			read,
		)

		// Write paths: one commit per scenario, as the apply transaction does. Two batch sizes
		// expose how a single commit scales with the number of staged updates.
		for (const count of updateCounts) {
			await measure(
				perf,
				scenarios,
				`transaction: update x${count} LNodes (iedName)`,
				async () => {
					await doc.transaction(async (tx) => {
						for (const lnode of lnodes.slice(0, count)) {
							await tx.update(lnode, { attributes: { iedName: 'VENDOR_1' } })
						}
					})
				},
				{ kind: 'write', profile: true },
			)
		}
		await measure(
			perf,
			scenarios,
			`transaction: addChild x${ADD_CHILD_COUNT} (LN)`,
			async () => {
				const [firstLdevice] = await doc.query.getRecordsByTagName('LDevice')
				await doc.transaction(async (tx) => {
					for (let i = 0; i < ADD_CHILD_COUNT; i++) {
						await tx.addChild(firstLdevice, {
							tagName: 'LN',
							attributes: { lnClass: 'MMXU', inst: `${1000 + i}`, lnType: 'MMXU_Type' },
						})
					}
				})
			},
			{ kind: 'write', profile: true },
		)

		// The take-over path: copy the type closure of the used LNodes into another document.
		await measure(
			perf,
			scenarios,
			`transaction: importTypes (${Math.min(IMPORT_TYPES_LNODES, lnodes.length)} LNodes -> empty doc)`,
			async () => {
				const [target] = await project.import([
					new File([`<SCL xmlns="http://www.iec.ch/61850/2003/SCL"></SCL>`], 'target.scd', {
						type: 'text/xml',
					}),
				])
				const targetDoc = project.openDocument(target.documentId)
				await targetDoc.transaction(async (tx) => {
					await importTypes(tx, {
						sourceQuery: doc.query,
						records: lnodes.slice(0, IMPORT_TYPES_LNODES),
					})
				})
			},
			{ kind: 'importTypes', profile: true },
		)
	} catch (error) {
		if (!(error instanceof CapError)) throw error
		// Over budget: keep what was measured, skip the rest. A slow run is a finding, not a failure.
		result.capped = error.message
	} finally {
		await project.destroy()
	}
	return result
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.floor(sorted.length / 2)]
}

/** `bench::<name>` is the scenario wall time; the slowest non-bench spans break it down. */
function printResult(result: RunResult): void {
	const { size, storage, runtime, stats, scenarios, capped } = result
	const lines = [
		`[PERF] === ${size} / ${storage} / ${runtime}${LOCAL_CORE ? ' / local core' : ''} === ` +
			`${(stats.bytes / 1024 / 1024).toFixed(2)} MB, ${stats.elementCount.toLocaleString()} elements, ` +
			`${stats.ieds} IEDs, ${stats.lnCount.toLocaleString()} LNs, ${stats.lnodeCount.toLocaleString()} LNodes`,
	]
	for (const { name, report, warmMs, profile } of scenarios) {
		const cold = report[`bench::${name}`].totalMs
		const warm = warmMs ? `  warm ${median(warmMs).toFixed(1).padStart(8)} ms` : ''
		lines.push(`[PERF]   ${name.padEnd(62)} ${cold.toFixed(1).padStart(9)} ms${warm}`)
		const breakdown = Object.entries(report)
			.filter(([span]) => !span.startsWith('bench::'))
			.sort((a, b) => b[1].totalMs - a[1].totalMs)
			.slice(0, 3)
		for (const [span, { totalMs, calls }] of breakdown) {
			lines.push(
				`[PERF]     ${span.padEnd(58)} ${totalMs.toFixed(0).padStart(7)} ms (${calls} calls)`,
			)
		}
		for (const { fn, selfMs } of profile ?? []) {
			lines.push(`[PERF]     cpu ${fn.padEnd(54)} ${selfMs.toFixed(0).padStart(7)} ms self`)
		}
	}
	if (capped) lines.push(`[PERF]   CAPPED: ${capped}; remaining scenarios skipped`)
	console.log(lines.join('\n'))
}

describe.skipIf(!RUN)(`scl workload performance (${RUNTIME})`, () => {
	for (const { label, params, storages, runtime, updateCounts } of SIZES) {
		if (runtime !== RUNTIME) continue
		for (const storage of storages) {
			it(`${label} / ${storage}`, async () => {
				const result = await runWorkload(label, params, storage, updateCounts)
				RESULTS.push(result)
				printResult(result)

				// Only sanity: the scenarios ran and the fixture matches its parameters.
				expect(result.scenarios.length).toBeGreaterThan(0)
				expect(result.stats.lnCount).toBe(
					params.ieds * params.ldevicesPerIed * params.lnsPerLdevice,
				)
			})
		}
	}

	it('summary', () => {
		console.log(`[PERF-JSON] ${JSON.stringify(RESULTS)}`)
	})
})
