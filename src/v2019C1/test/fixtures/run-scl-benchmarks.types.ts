import type { Config } from '@/v2019C1/config/dialecte.config'
import type { SCL_EXTENSION_MODULES } from '@/v2019C1/extensions'
import type { AnyRef, Document, Project } from '@dialecte/core'

export type SclModules = typeof SCL_EXTENSION_MODULES

/** Live handles a benchmark reads from, prepared once per fixture. */
export type BenchContext = {
	project: Project<Config, SclModules>
	sourceDoc: Document<Config>
	lnodes: Awaited<ReturnType<Document<Config>['query']['getRecordsByTagName']>>
}

export type Benchmark = {
	name: string
	/** `scl::` spans this row must produce (checked by the wiring guard). */
	instruments: string[]
	run: (context: BenchContext) => Promise<unknown>
}

/** Live handles an `info` row reads from, prepared once per scale. */
export type InfoBenchContext = {
	sourceDoc: Document<Config>
	/** Every element under the Substation, transparent wrappers lifted, as a tree view lists them. */
	refs: AnyRef[]
}

export type InfoBenchmark = {
	name: string
	/** Perf names (spans or core read counters) this row must produce (checked by the wiring guard). */
	instruments: string[]
	run: (context: InfoBenchContext) => Promise<unknown>
}
