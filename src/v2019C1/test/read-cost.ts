import { countDocumentQueryReads } from './count-query-reads'
import { RECORD_READERS, RECORDS_MOVED_TALLIES, STORE_CALL_TALLIES } from './read-cost.constants'

import type { ReadCost, ReadCostSource } from './read-cost.types'

/**
 * Run `read` on a counting copy of the source's query, the perf counters reset first, and answer what it returned with
 * what it cost (`ReadCost`). The project must be opened with `dev: { perf: true }`.
 */
export async function measureReadCost<GenericQuery extends { any: object }, GenericResult>(params: {
	source: ReadCostSource<GenericQuery>
	read: (query: GenericQuery) => Promise<GenericResult>
}): Promise<{ result: GenericResult; cost: ReadCost }> {
	const { source, read } = params
	const counted = countDocumentQueryReads(source.query)
	source.perf.reset()
	const result = await read(counted.query)
	const report = source.perf.report()
	const calls: Record<string, number> = {}
	for (const { method } of counted.calls()) {
		if (!RECORD_READERS.has(method)) calls[method] = (calls[method] ?? 0) + 1
	}
	return {
		result,
		cost: {
			calls,
			storeCalls: sumOfTallies({ report, tallies: STORE_CALL_TALLIES }),
			recordsMoved: sumOfTallies({ report, tallies: RECORDS_MOVED_TALLIES }),
		},
	}
}

function sumOfTallies(params: {
	report: Record<string, { count?: number }>
	tallies: readonly string[]
}): number {
	const { report, tallies } = params
	let total = 0
	for (const tally of tallies) total += report[tally]?.count ?? 0
	return total
}
