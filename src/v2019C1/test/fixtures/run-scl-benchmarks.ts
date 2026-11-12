/**
 * SCL method benchmark harness — the scl mirror of core's `run-core-benchmarks.ts`. Runs
 * every fixture size in sequence and times the scl operations we instrumented against it, so
 * the numbers scale with the type-closure count (~2.1K closures/MB).
 *
 * Centralized calls: every benchmarked op is a row in {@link BENCHMARKS} or
 * {@link INFO_BENCHMARKS}; a wiring guard (`assertInstrumented`) fails if a row's declared
 * perf names (`scl::` spans, or core read counters for an `info` row) stop appearing, so an
 * op that loses its instrumentation trips the run. Add an instrumented scl op → add a row
 * (or the guard is silent for it).
 *
 * Runs against SOURCE via the `@/` alias (importTypes is internal), inMemory store to isolate
 * method cost from IndexedDB. tsx only resolves `@/` from a tsconfig that declares the path,
 * so point it at `tsconfig.node.json`. Generate fixtures first
 * (`generate-scl-stress-fixtures.ts`):
 *
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json npx tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts        # 5/10/50 MB
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json npx tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts 1 5    # only those
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json node --max-old-space-size=8192 --import=tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts 100
 *
 * `info` runs the `info` rows instead, on a fixture built in memory (`generate-scl-info-fixture.ts`),
 * at the given scales (default 1 and 4); each row prints its store reads, the counts that matter
 * more than in-memory wall time:
 *
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json npx tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts info
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json npx tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts info 1 8
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { generateSclInfoFixture } from './generate-scl-info-fixture'
import {
	BENCHMARKS,
	DEFAULT_INFO_SCALES,
	DEFAULT_SIZES_MB,
	IMPORT_TYPES_SPANS,
	INFO_BENCHMARKS,
	SCL_HOOKS,
	STORE_READ_COUNTERS,
} from './run-scl-benchmarks.constants'

import { Project } from '@dialecte/core'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'

import type { SclModules } from './run-scl-benchmarks.types'
import type { Config } from '@/v2019C1/config/dialecte.config'
import type { AnyRef, AnyTreeRecord } from '@dialecte/core'

async function openSclProject(): Promise<Project<Config, SclModules>> {
	return new Project<Config, SclModules>({
		configs: { default: SCL_DIALECTE_CONFIG },
		defaultConfigKey: 'default',
		storage: { type: 'inMemory' },
		extensions: { base: SCL_EXTENSION_MODULES },
		hooks: SCL_HOOKS,
		dev: { perf: true },
	}).open(`scl-bench-${crypto.randomUUID()}`)
}

/** Fail if a row's declared perf names (spans or counters) didn't appear — its instrumentation broke. */
function assertInstrumented(params: {
	report: Record<string, unknown>
	instruments: string[]
}): void {
	const missing = params.instruments.filter((name) => !(name in params.report))
	if (missing.length > 0) {
		throw new Error(
			`Instrumentation missing — these perf names never appeared:\n` +
				missing.map((name) => `  • ${name}`).join('\n') +
				`\nA benchmarked op lost its perf instrumentation, or the benchmark did not exercise it.`,
		)
	}
}

async function benchmarkFixture(params: { mb: number; dataDir: string }): Promise<void> {
	const { mb, dataDir } = params
	const xml = await readFile(join(dataDir, `scl-stress-${mb}mb.scd`), 'utf8')

	const project = await openSclProject()
	performance.clearMarks()
	performance.clearMeasures()

	const importStart = performance.now()
	const imported = await project.importFile(new File([xml], 'src.scd', { type: 'text/xml' }), {
		useCustomRecordsIds: true,
	})
	const importMs = performance.now() - importStart
	const sourceDoc = project.openDocument(imported.documentId)
	const lnodes = await sourceDoc.query.getRecordsByTagName('LNode')

	try {
		console.log(
			`\n=== ${mb} MB ===  import ${importMs.toFixed(0)} ms | ${lnodes.length.toLocaleString()} LNodes`,
		)
		for (const bench of BENCHMARKS) {
			const start = performance.now()
			await bench.run({ project, sourceDoc, lnodes })
			console.log(`  ${bench.name.padEnd(40)} ${(performance.now() - start).toFixed(1)} ms`)
		}

		const report = sourceDoc.perf.report()
		if (mb === DEFAULT_SIZES_MB[0])
			assertInstrumented({ report, instruments: BENCHMARKS.flatMap((bench) => bench.instruments) })
		for (const name of IMPORT_TYPES_SPANS) {
			const span = report[name]
			if (span)
				console.log(`    ${name.padEnd(38)} ${span.totalMs.toFixed(0)} ms (${span.calls} calls)`)
		}
	} finally {
		await project.destroy()
	}
}

async function benchmarkInfo(params: { scale: number }): Promise<void> {
	const { scale } = params
	const { xml, lnodes, signals } = generateSclInfoFixture({ scale })

	const project = await openSclProject()
	try {
		const imported = await project.importFile(new File([xml], 'info.scd', { type: 'text/xml' }))
		const sourceDoc = project.openDocument(imported.documentId)
		const [substation] = await sourceDoc.query.getRecordsByTagName('Substation')
		const tree = substation ? await sourceDoc.query.getTree(substation) : undefined
		const refs = tree ? flattenTree(tree) : []

		console.log(
			`\n=== info, scale ${scale} ===  ${refs.length.toLocaleString()} elements | ` +
				`${lnodes} mapped LNodes | ${signals} signals`,
		)
		for (const bench of INFO_BENCHMARKS) {
			sourceDoc.perf.reset()
			const start = performance.now()
			await bench.run({ sourceDoc, refs })
			const wallMs = performance.now() - start
			const report = sourceDoc.perf.report()
			assertInstrumented({ report, instruments: bench.instruments })
			const reads = STORE_READ_COUNTERS.map(
				(name) =>
					`${name.replace('core::store::', '')} ${(report[name]?.count ?? 0).toLocaleString()}`,
			).join(' | ')
			console.log(`  ${bench.name.padEnd(50)} ${wallMs.toFixed(0)} ms | ${reads}`)
		}
	} finally {
		await project.destroy()
	}
}

/** Every descendant of a tree, depth first, as refs. */
function flattenTree(root: AnyTreeRecord): AnyRef[] {
	return root.tree.flatMap((child) => [
		{ tagName: child.tagName, id: child.id },
		...flattenTree(child),
	])
}

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const infoMode = args[0] === 'info'
	const numbers = (infoMode ? args.slice(1) : args)
		.map(Number)
		.filter((value) => Number.isFinite(value) && value > 0)

	if (infoMode) {
		const integers = numbers.filter((value) => Number.isInteger(value))
		const dropped = numbers.filter((value) => !Number.isInteger(value))
		if (dropped.length > 0)
			console.warn(`info: scales must be whole numbers, ignored ${dropped.join(', ')}`)
		const scales = integers.length > 0 ? integers : DEFAULT_INFO_SCALES
		for (const scale of scales) await benchmarkInfo({ scale })
		return
	}

	const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
	const sizes = numbers.length > 0 ? numbers : DEFAULT_SIZES_MB
	for (const mb of sizes) await benchmarkFixture({ mb, dataDir })
}

// Exit once every fixture is measured: `Project.destroy()` of @dialecte/core 0.7.0 leaves the
// project's stale-import sweep interval running, which would keep node alive.
main().then(
	() => process.exit(0),
	(err) => {
		console.error(err)
		process.exit(1)
	},
)
