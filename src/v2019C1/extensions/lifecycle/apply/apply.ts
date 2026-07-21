import { assertDecisionsCoherent } from '@/v2019C1/extensions/lifecycle/engine'
import { asd as updateAsd, fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update'

import type { AppliedInstances, ApplyResult } from './apply.types'
import type { Config } from '@/v2019C1/config'
import type {
	LifecycleApplyParams,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.apply` — the generic write surface (ENGINE.md §4/§6, 07 §4).
 *
 * The consumer classifies first (`query.lifecycle.report`) and passes the
 * `report` in. The report + `decisions` gate what is written:
 *
 *  - **fast** (`needsDecisions === false`): first-time instantiate or a
 *    conflict-free change → apply headless (delegate to the per-layer update
 *    verb with no gate). When `decisions` are still supplied, their user value
 *    edits (editable attributes) are honored; there is simply no accept/skip gate.
 *  - **full, not decided** (`needsDecisions === true`, no `decisions`): a human
 *    must resolve decisions first → nothing is written; the report is returned
 *    unchanged so the caller can drive the review flow.
 *  - **full, decided** (`decisions` present): apply ONLY the accepted groups and
 *    their companions (the gate is passed to the update verb, which threads it
 *    through reconcile and the ASD cascade). A group absent from the map defaults
 *    to accept. The engine rejects a decision set that accepts a group whose
 *    `dependsOn` parent is skipped (07 §4).
 *
 * Returns `{ report, instances }` — the effective report plus the instance roots
 * the write produced/reconciled. Run inside `doc.prepare(tx => tx.lifecycle.apply(...))`
 * for a previewable, reversible dry-run.
 */
export async function apply(
	tx: Core.Transaction<Config>,
	params: LifecycleApplyParams,
): Promise<ApplyResult> {
	const { report, decisions } = params

	// No decisions supplied: fast track applies headless; full track waits for a human.
	if (!decisions) {
		if (report.needsDecisions) return { report, instances: emptyInstances(params.verb) } // not decided yet
		const instances = await runVerb(tx, params, report, undefined) // fast track: no gate = apply all
		return { report, instances }
	}

	// Decisions supplied: honor gating AND user value edits — even on the fast track,
	// a conflict-free instantiate can still carry edited editable attributes.
	assertDecisionsCoherent({ groups: report.groups, decisions })
	const instances = await runVerb(tx, params, report, decisions)
	return { report, instances }
}

/** The empty instance set for a verb (the not-decided-yet track writes nothing). */
function emptyInstances(verb: LifecycleTarget['verb']): AppliedInstances {
	return verb === 'fsd'
		? { verb: 'fsd', functions: [] }
		: { verb: 'asd', applications: [], functions: [] }
}

/**
 * Delegate to the per-layer update verb. The FSD verb owns the multi-instance loop,
 * so it receives the `report` + `decisions` and partitions gating per instance. The
 * ASD verb still takes a pre-computed `accepted`/`overrides` (single-instance path;
 * Phase B unifies it).
 */
async function runVerb(
	tx: Core.Transaction<Config>,
	target: LifecycleTarget,
	report: DiffReport,
	decisions: DecisionMap | undefined,
): Promise<AppliedInstances> {
	if (target.verb === 'fsd') {
		const functions = await updateFsd(tx, {
			sourceQuery: target.sourceQuery,
			functionRef: target.ref,
			targetParent: target.anchor,
			scenario: target.scenario,
			report,
			decisions,
		})
		return { verb: 'fsd', functions }
	}
	const { applications, functions } = await updateAsd(tx, {
		sourceQuery: target.sourceQuery,
		applicationRef: target.ref,
		targetParent: target.anchor,
		scenario: target.scenario,
		report,
		decisions,
	})
	return { verb: 'asd', applications, functions }
}
