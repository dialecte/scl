import { asd as updateAsd, fsd as updateFsd } from './update/transaction'

import type { LifecycleApplyParams } from './seam.types'
import type { Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.apply` — the generic write seam (ENGINE.md §4/§6).
 *
 * The consumer classifies first (`query.lifecycle.report`) and passes the
 * `report` in. The report gates the track:
 *
 *  - **fast** (`needsDecisions === false`): first-time instantiate or a
 *    conflict-free change → apply headless (delegate to the per-layer update
 *    verb, which is instantiate-or-reconcile).
 *  - **full** (`needsDecisions === true`): the instance exists and something
 *    changed → a human must resolve decisions before anything is written.
 *    Nothing is applied here (decisions → ops is a planned follow-up); the
 *    report is returned unchanged so the caller can drive the review flow.
 *
 * Returns the effective report so a headless caller can inspect what happened.
 * Run inside `doc.prepare(tx => tx.lifecycle.apply(...))` for a previewable,
 * reversible dry-run.
 */
export async function apply(
	tx: Core.Transaction<Config>,
	params: LifecycleApplyParams,
): Promise<DiffReport> {
	const { report } = params

	if (report.needsDecisions) return report

	if (params.verb === 'fsd') {
		await updateFsd(tx, {
			sourceQuery: params.sourceQuery,
			functionRef: params.ref,
			targetParent: params.anchor,
		})
	} else {
		await updateAsd(tx, {
			sourceQuery: params.sourceQuery,
			applicationRef: params.ref,
			targetParent: params.anchor,
		})
	}

	return report
}
