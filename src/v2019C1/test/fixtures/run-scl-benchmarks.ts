/**
 * SCL method benchmark harness — the scl mirror of core's `run-core-benchmarks.ts`. Runs
 * every fixture size in sequence and times the scl operations we instrumented against it, so
 * the numbers scale with the type-closure count (~2.1K closures/MB).
 *
 * Centralized calls: every benchmarked op is a row in {@link BENCHMARKS}; a wiring guard
 * (`assertInstrumented`) fails if the instrumented `scl::` spans stop appearing, so an
 * op that loses its perf instrumentation trips the run. Add an instrumented scl op → add a
 * row here (or the guard is silent for it).
 *
 * Runs against SOURCE via the `@/` alias (importTypes is internal), inMemory store to isolate
 * method cost from IndexedDB. tsx only resolves `@/` from a tsconfig that declares the path,
 * so point it at `tsconfig.node.json`. Generate fixtures first
 * (`generate-scl-stress-fixtures.ts`):
 *
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json npx tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts        # 5/10/50 MB
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json npx tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts 1 5    # only those
 *   TSX_TSCONFIG_PATH=./tsconfig.node.json node --max-old-space-size=8192 --import=tsx src/v2019C1/test/fixtures/run-scl-benchmarks.ts 100
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Project } from '@dialecte/core'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'
import { importTypes } from '@/v2019C1/extensions/data-model/transaction/import-types'
import { HOOKS, createSclIoHooks } from '@/v2019C1/hooks'

import type { Config } from '@/v2019C1/config/dialecte.config'
import type { Document } from '@dialecte/core'

const DEFAULT_SIZES_MB = [5, 10, 50]
const EMPTY_SCL = `<SCL xmlns="http://www.iec.ch/61850/2003/SCL" __id="scl-target"></SCL>`
const SCL_HOOKS = { ...createSclIoHooks(), ...HOOKS }
type SclModules = typeof SCL_EXTENSION_MODULES

/** Live handles a benchmark reads from, prepared once per fixture. */
type BenchContext = {
	project: Project<Config, SclModules>
	sourceDoc: Document<Config>
	lnodes: Awaited<ReturnType<Document<Config>['query']['getRecordsByTagName']>>
}

type Benchmark = {
	name: string
	/** `scl::` spans this row must produce (checked by the wiring guard). */
	instruments: string[]
	run: (ctx: BenchContext) => Promise<unknown>
}

const BENCHMARKS: Benchmark[] = [
	{
		name: 'importTypes(all LNodes → empty target)',
		instruments: ['scl::importTypes', 'scl::importTypes::sourceLoop'],
		run: async ({ project, sourceDoc, lnodes }) => {
			const [target] = await project.import(
				[new File([EMPTY_SCL], 't.scd', { type: 'text/xml' })],
				{
					useCustomRecordsIds: true,
				},
			)
			const targetDoc = project.openDocument(target.documentId)
			await targetDoc.transaction(async (tx) => {
				await importTypes(tx, { sourceQuery: sourceDoc.query, records: lnodes })
			})
		},
	},
]

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

/** Fail if a benchmark's declared `scl::` spans didn't appear — its instrumentation broke. */
function assertInstrumented(report: Record<string, unknown>): void {
	const missing = BENCHMARKS.flatMap((b) => b.instruments).filter((name) => !(name in report))
	if (missing.length > 0) {
		throw new Error(
			`Instrumentation missing — these scl:: spans never appeared:\n` +
				missing.map((n) => `  • ${n}`).join('\n') +
				`\nA benchmarked op lost its perf spans, or the benchmark did not exercise it.`,
		)
	}
}

async function benchmarkFixture(mb: number, dataDir: string): Promise<void> {
	const xml = await readFile(join(dataDir, `scl-stress-${mb}mb.scd`), 'utf8')

	const project = await openSclProject()
	performance.clearMarks()
	performance.clearMeasures()

	const importStart = performance.now()
	const [imported] = await project.import([new File([xml], 'src.scd', { type: 'text/xml' })], {
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
		if (mb === DEFAULT_SIZES_MB[0]) assertInstrumented(report)
		for (const name of [
			'scl::importTypes',
			'scl::importTypes::sourceLoop',
			'scl::importTypes::preExistingIndex',
		]) {
			const span = report[name]
			if (span)
				console.log(`    ${name.padEnd(38)} ${span.totalMs.toFixed(0)} ms (${span.calls} calls)`)
		}
	} finally {
		await project.destroy()
	}
}

async function main(): Promise<void> {
	const here = dirname(fileURLToPath(import.meta.url))
	const dataDir = join(here, 'data')
	const argSizes = process.argv
		.slice(2)
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0)
	const sizes = argSizes.length > 0 ? argSizes : DEFAULT_SIZES_MB

	for (const mb of sizes) await benchmarkFixture(mb, dataDir)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
