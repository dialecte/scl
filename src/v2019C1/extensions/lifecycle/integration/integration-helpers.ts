import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'

import type {
	ForkInTurnParams,
	ReportAndApplyParams,
	ReportedAndApplied,
} from './integration-helpers.types'

/**
 * Report, then apply that report in one transaction, through the public two-track surface — what a consumer does. The
 * decisions are an empty map unless the case takes some (every group at its suggested action), or none at all.
 */
export async function reportAndApply(params: ReportAndApplyParams): Promise<ReportedAndApplied> {
	const { document, lifecycle, decide, withoutDecisions } = params
	const reported = await report(document.query, lifecycle)
	const decisions = decide ? decide(reported) : new Map()
	const applied = await document.transaction(async function applyReport(tx) {
		return apply(tx, {
			...lifecycle,
			report: reported,
			...(withoutDecisions ? {} : { resolution: { decisions } }),
		})
	})
	return { report: reported, applied }
}

/** Fork the same revision several times in a row, each turn reported then applied: what each turn gave, in order. */
export async function forkInTurn(params: ForkInTurnParams): Promise<ReportedAndApplied[]> {
	const { turns, ...reportAndApplyParams } = params
	const results: ReportedAndApplied[] = []
	for (let turn = 0; turn < turns; turn++) {
		const result = await reportAndApply(reportAndApplyParams)
		results.push(result)
	}
	return results
}
