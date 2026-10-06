import { makeUnique } from '@/v2019C1/extensions/lifecycle/constraints'
import { allGroups, assertDecisionsCoherent } from '@/v2019C1/extensions/lifecycle/engine'
import { assertMappingsCoherent } from '@/v2019C1/extensions/lifecycle/mapping'
import {
	asd as updateAsd,
	fsd as updateFsd,
	ssd as updateSsd,
} from '@/v2019C1/extensions/lifecycle/update'

import type { AppliedInstances, ApplyResult } from './apply.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	AfterApplyHook,
	LifecycleApplyParams,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.apply` — the generic write surface.
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
 *    `dependsOn` parent is skipped.
 *
 * Returns `{ report, instances }` — the effective report plus the instance roots
 * the write produced/reconciled. Run inside `doc.prepare(tx => tx.lifecycle.apply(...))`
 * for a previewable, reversible dry-run.
 */
export async function apply(
	tx: Core.Transaction<Config>,
	params: LifecycleApplyParams,
): Promise<ApplyResult> {
	const { report } = params
	const decisions = params.resolution?.decisions

	// mapping choices the report cannot honour are refused before any write
	const decisionMappings = params.resolution?.mappings
	if (decisionMappings)
		assertMappingsCoherent({ reportMappings: report.mappings, decisionMappings })

	// No decisions supplied: fast track applies headless; full track waits for a human.
	if (!decisions && report.needsDecisions) {
		return { report, instances: emptyInstances(params.verb) } // not decided yet: nothing is written
	}

	// Decisions supplied: honor gating AND user value edits — even on the fast track,
	// a conflict-free instantiate can still carry edited editable attributes.
	if (decisions) assertDecisionsCoherent({ groups: allGroups(report), decisions })
	const instances = await runVerb(tx, params, report, decisions) // no decisions: no gate = apply all

	// the consumer's own step, once everything is written, in the same transaction
	const afterApply = params.resolution?.afterApply
	if (afterApply) await runAfterApply(tx, { afterApply, instances })

	return { report, instances }
}

/**
 * Run the consumer's step, then make unique again what it renamed among the applications and
 * functions the apply placed or reconciled: a name it gives that is taken where the element sits
 * is numbered as the engine numbers its own. What it did not rename is left as it is.
 */
async function runAfterApply(
	tx: Core.Transaction<Config>,
	params: { afterApply: AfterApplyHook; instances: AppliedInstances },
): Promise<void> {
	const { afterApply, instances } = params
	const roots: Scl.Ref<Scl.ElementsOf>[] =
		instances.verb === 'fsd'
			? instances.functions
			: [...instances.applications, ...instances.functions]

	const namesBefore: (string | undefined)[] = []
	for (const root of roots) {
		namesBefore.push(await tx.getAttribute(root, { name: 'name' }))
	}

	await afterApply(tx as Scl.Transaction, { instances })

	for (const [index, root] of roots.entries()) {
		// the consumer may have removed it
		const record = await tx.getRecord(root)
		if (!record) continue
		const name = await tx.getAttribute(root, { name: 'name' })
		if (name !== namesBefore[index]) await makeUnique(tx, { ref: root })
	}
}

/** The empty instance set for a verb (the not-decided-yet track writes nothing). */
function emptyInstances(verb: LifecycleTarget['verb']): AppliedInstances {
	if (verb === 'fsd') return { verb: 'fsd', functions: [] }
	if (verb === 'ssd') return { verb: 'ssd', applications: [], functions: [] }
	return { verb: 'asd', applications: [], functions: [] }
}

/**
 * Delegate to the per-layer update verb. The FSD verb owns the multi-instance loop,
 * so it receives the `report` + `decisions` and partitions gating per instance. The
 * ASD verb still takes a pre-computed `accepted`/`overrides` (single-instance path;
 * Phase B unifies it).
 */
async function runVerb(
	tx: Core.Transaction<Config>,
	target: LifecycleApplyParams,
	report: DiffReport,
	decisions: DecisionMap | undefined,
): Promise<AppliedInstances> {
	if (target.verb === 'fsd') {
		const functions = await updateFsd(tx, {
			sourceQuery: target.sourceQuery,
			functionRef: target.ref,
			targetParent: target.anchor,
			scenario: target.scenario,
			targetInstance: target.targetInstance,
			report,
			decisions,
			keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
			decisionMappings: target.resolution?.mappings,
			resolvePlacement: true,
		})
		return { verb: 'fsd', functions }
	}
	if (target.verb === 'ssd') {
		const { applications, functions } = await updateSsd(tx, {
			sourceQuery: target.sourceQuery,
			// the SSD scope is the instantiable root (first named element below the TEMPLATE scaffolding), resolved from the
			// source - not `target.ref`, which is only the coarse process-section anchor.
			targetParent: target.anchor,
			scenario: target.scenario,
			targetInstance: target.targetInstance,
			report,
			decisions,
			keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
			decisionMappings: target.resolution?.mappings,
		})
		return { verb: 'ssd', applications, functions }
	}
	const { applications, functions } = await updateAsd(tx, {
		sourceQuery: target.sourceQuery,
		applicationRef: target.ref,
		targetParent: target.anchor,
		scenario: target.scenario,
		targetInstance: target.targetInstance,
		report,
		decisions,
		keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
		decisionMappings: target.resolution?.mappings,
		resolvePlacement: true,
	})
	return { verb: 'asd', applications, functions }
}
