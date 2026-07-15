import { acceptedRefIds, assertDecisionsCoherent, collisionOverrides } from './engine/decide'
import { asd as updateAsd, fsd as updateFsd } from './update/transaction'

import type { AcceptedIds, CollisionOverrides } from './engine/decide'
import type { LifecycleApplyParams, LifecycleTarget } from './seam.types'
import type { Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.apply` — the generic write seam (ENGINE.md §4/§6, 07 §4).
 *
 * The consumer classifies first (`query.lifecycle.report`) and passes the
 * `report` in. The report + `decisions` gate what is written:
 *
 *  - **fast** (`needsDecisions === false`): first-time instantiate or a
 *    conflict-free change → apply headless (delegate to the per-layer update
 *    verb with no gate). `decisions` are ignored.
 *  - **full, not decided** (`needsDecisions === true`, no `decisions`): a human
 *    must resolve decisions first → nothing is written; the report is returned
 *    unchanged so the caller can drive the review flow.
 *  - **full, decided** (`decisions` present): apply ONLY the accepted groups and
 *    their companions (the gate is passed to the update verb, which threads it
 *    through reconcile and the ASD cascade). A group absent from the map defaults
 *    to accept. The engine rejects a decision set that accepts a group whose
 *    `dependsOn` parent is skipped (07 §4).
 *
 * Returns the effective report. Run inside `doc.prepare(tx => tx.lifecycle.apply(...))`
 * for a previewable, reversible dry-run.
 */
export async function apply(
	tx: Core.Transaction<Config>,
	params: LifecycleApplyParams,
): Promise<DiffReport> {
	const { report, decisions } = params

	if (!report.needsDecisions) {
		await runVerb(tx, params, undefined, undefined) // fast track: no gate = apply all
		return report
	}

	if (!decisions) return report // full track, not decided yet

	assertDecisionsCoherent({ groups: report.groups, decisions })
	await runVerb(
		tx,
		params,
		acceptedRefIds({ groups: report.groups, decisions }),
		collisionOverrides({ groups: report.groups, decisions }),
	)
	return report
}

/**
 * Delegate to the per-layer update verb. `accepted` is the decision gate:
 * `undefined` (fast) applies everything; present (full) applies only the
 * accepted groups + companions. `overrides` carries the user-edited values
 * that drive collision resolution on the full track.
 */
async function runVerb(
	tx: Core.Transaction<Config>,
	target: LifecycleTarget,
	accepted: AcceptedIds | undefined,
	overrides: CollisionOverrides | undefined,
): Promise<void> {
	if (target.verb === 'fsd') {
		await updateFsd(tx, {
			sourceQuery: target.sourceQuery,
			functionRef: target.ref,
			targetParent: target.anchor,
			accepted,
			overrides,
		})
	} else {
		await updateAsd(tx, {
			sourceQuery: target.sourceQuery,
			applicationRef: target.ref,
			targetParent: target.anchor,
			accepted,
			overrides,
		})
	}
}
