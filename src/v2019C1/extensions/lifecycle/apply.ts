import { acceptedRefIds, assertDecisionsCoherent } from './engine/decide'
import { reconcile } from './engine/reconcile'
import { findInstanceUnder } from './update/find-instance'
import { asd as updateAsd, fsd as updateFsd } from './update/transaction'

import { invariant } from '@dialecte/core/utils'

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
 *    verb, which is instantiate-or-reconcile). `decisions` are ignored.
 *  - **full, not decided** (`needsDecisions === true`, no `decisions`): a human
 *    must resolve decisions first → nothing is written; the report is returned
 *    unchanged so the caller can drive the review flow.
 *  - **full, decided** (`decisions` present): apply ONLY the accepted groups and
 *    their companions. A group absent from the map defaults to accept. The
 *    engine rejects a decision set that accepts a group whose `dependsOn` parent
 *    is skipped (07 §4).
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
		await applyHeadless(tx, params)
		return report
	}

	if (!decisions) return report // full track, not decided yet

	await applyDecided(tx, params)
	return report
}

/** Fast track: apply the whole change headless via the per-layer update verb. */
async function applyHeadless(tx: Core.Transaction<Config>, target: LifecycleTarget): Promise<void> {
	if (target.verb === 'fsd') {
		await updateFsd(tx, {
			sourceQuery: target.sourceQuery,
			functionRef: target.ref,
			targetParent: target.anchor,
		})
	} else {
		await updateAsd(tx, {
			sourceQuery: target.sourceQuery,
			applicationRef: target.ref,
			targetParent: target.anchor,
		})
	}
}

/** Full track: reconcile only the accepted groups (+ their companions). */
async function applyDecided(
	tx: Core.Transaction<Config>,
	params: LifecycleApplyParams & { decisions: NonNullable<LifecycleApplyParams['decisions']> },
): Promise<void> {
	const { report, decisions } = params

	assertDecisionsCoherent({ groups: report.groups, decisions })
	const accepted = acceptedRefIds({ groups: report.groups, decisions })

	// Gated apply is implemented for the function layer; the ASD cascade gating
	// is a planned follow-up (07 §4.1 / update.fromAsd cascade).
	invariant(params.verb === 'fsd', {
		detail: `lifecycle.apply: decision-gated apply is not yet supported for verb "${params.verb}"`,
	})

	const { uuid } = await params.sourceQuery.getAttributes(params.ref)
	const instance = await findInstanceUnder(tx, {
		targetParent: params.anchor,
		tagName: 'Function',
		sourceUuid: uuid,
	})
	invariant(instance, {
		detail: 'lifecycle.apply: full track expects an existing instance to reconcile onto',
	})

	await reconcile(tx, {
		sourceQuery: params.sourceQuery,
		sourceRootRef: params.ref,
		instanceRootRef: instance,
		accepted,
	})
}
