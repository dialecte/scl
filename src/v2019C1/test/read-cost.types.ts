/**
 * What one read costs: the query calls made (by name, through the query and its `any`, the record readers left out),
 * the store calls and the records they move (the dev perf tallies).
 */
export type ReadCost = { calls: Record<string, number>; storeCalls: number; recordsMoved: number }

/** A document query that counts its reads, and the dev perf counters of its project. */
export type ReadCostSource<GenericQuery extends { any: object }> = {
	query: GenericQuery
	perf: { reset: () => void; report: () => Record<string, { count?: number }> }
}
