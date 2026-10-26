import { assertReportFits } from './assert-report-fits'
import { collectWrittenImplementation } from './collect-written-implementation'

import { cleanUp } from '@/v2019C1/extensions/clean-up'
import { makeUnique } from '@/v2019C1/extensions/lifecycle/constraints'
import {
	allGroups,
	assertDecisionsCoherent,
	assertNoAcceptedCollision,
	clearAnnotations,
} from '@/v2019C1/extensions/lifecycle/engine'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { assertMappingsCoherent } from '@/v2019C1/extensions/lifecycle/mapping'
import {
	assertRevisionBaseFits,
	scenarioPolicy,
} from '@/v2019C1/extensions/lifecycle/scenario-policy'
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
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.apply` — the generic write surface.
 *
 * The consumer classifies first (`query.lifecycle.report`) and passes the
 * `report` in. The report + `decisions` gate what is written:
 *
 *  - **fast** (`needsDecisions === false`): first-time instantiate or a
 *    conflict-free change → apply headless: what the report lists is written, each
 *    group at its suggested action (an element the project added is kept), nothing
 *    the report does not list. Decisions supplied anyway are honored, user value
 *    edits included.
 *  - **full, not decided** (`needsDecisions === true`, no `decisions`): a human
 *    must resolve decisions first → nothing is written; the report is returned
 *    unchanged so the caller can drive the review flow.
 *  - **full, decided** (`decisions` present): apply ONLY the accepted groups and
 *    their companions (the gate is passed to the update verb, which threads it
 *    through reconcile and the ASD cascade). A group absent from the map takes
 *    its suggested action. The engine rejects a decision set that accepts a group
 *    whose `dependsOn` parent is skipped.
 *
 * A fork reads the previous revision of the file it is given (`baseQuery`) once, as `report` did:
 * an element the newer revision lacks is removed when the previous revision held it.
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
	const decisions = params.resolution?.decisions ?? new Map()
	const decisionMappings = params.resolution?.mappings

	// a report made for another target, or naming what the document no longer holds, is refused whatever the track
	await assertReportFits(tx, { report, target: params, decisionMappings })
	// mapping choices the report cannot honour are refused before any write
	if (decisionMappings)
		assertMappingsCoherent({ reportMappings: report.mappings, decisionMappings })

	// a previous revision only a fork reads: refused whatever the track
	assertRevisionBaseFits({ scenario: params.scenario, baseQuery: params.baseQuery })

	// No decisions supplied: the full track waits for a human, nothing is written
	if (!params.resolution?.decisions && report.needsDecisions) {
		return { report, instances: emptyInstances(params.verb) }
	}

	// the gate is always the report's: no decisions = each group at its suggested action. User value edits are honored
	// on either track, a conflict-free instantiate can carry edited editable attributes.
	const groups = allGroups(report)
	assertDecisionsCoherent({ groups, decisions })
	// an addition the report says collides on a key nothing can change is refused before anything is written
	assertNoAcceptedCollision({ groups, decisions })
	// what tells a dropped element from the project's own, read once for the whole apply
	const removalBase = await resolveRemovalBase({
		policy: scenarioPolicy({ scenario: params.scenario }),
		sourceQuery: params.sourceQuery,
		baseQuery: params.baseQuery,
	})
	// the report tells what THIS run places: what an earlier run placed is forgotten first
	clearAnnotations({ report })
	const writtenFrom = tx.getStagedOperations().length
	const instances = await runVerb(tx, { target: params, report, decisions, removalBase })

	// what the template brings keeps the implementation it had there: what this run wrote naming a
	// logical node, ExtRef or ExtCtrl the project lacks is released, once everything is written
	const elements = collectWrittenImplementation(tx, { from: writtenFrom })
	if (elements.length > 0) await cleanUp.transaction.resetLNode(tx, { elements })

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
	const roots = appliedRoots(instances)

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

/** The applications and functions an apply placed or reconciled, whatever its verb. */
function appliedRoots(instances: AppliedInstances): Scl.Ref<Scl.ElementsOf>[] {
	switch (instances.verb) {
		case 'fsd':
			return instances.functions
		case 'asd':
		case 'ssd':
			return [...instances.applications, ...instances.functions]
	}
}

/** The empty instance set for a verb (the not-decided-yet track writes nothing). */
function emptyInstances(verb: LifecycleTarget['verb']): AppliedInstances {
	switch (verb) {
		case 'fsd':
			return { verb: 'fsd', functions: [] }
		case 'asd':
			return { verb: 'asd', applications: [], functions: [] }
		case 'ssd':
			return { verb: 'ssd', applications: [], functions: [] }
	}
}

/**
 * Delegate to the per-layer update verb. The FSD verb owns the multi-instance loop,
 * so it receives the `report` + `decisions` and partitions gating per instance. The
 * ASD verb still takes a pre-computed `accepted`/`overrides` (single-instance path;
 * Phase B unifies it).
 */
async function runVerb(
	tx: Core.Transaction<Config>,
	params: {
		target: LifecycleApplyParams
		report: DiffReport
		decisions: DecisionMap
		removalBase: RemovalBase
	},
): Promise<AppliedInstances> {
	const { target, report, decisions, removalBase } = params
	switch (target.verb) {
		case 'fsd': {
			const functions = await updateFsd(tx, {
				sourceQuery: target.sourceQuery,
				functionRef: target.ref,
				targetParent: target.anchor,
				scenario: target.scenario,
				removalBase,
				targetInstance: target.targetInstance,
				report,
				decisions,
				keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
				decisionMappings: target.resolution?.mappings,
				resolvePlacement: true,
			})
			return { verb: 'fsd', functions }
		}
		case 'ssd': {
			const { applications, functions } = await updateSsd(tx, {
				sourceQuery: target.sourceQuery,
				// the SSD scope is the instantiable root (first named element below the TEMPLATE scaffolding), resolved from the
				// source - not `target.ref`, which is only the coarse process-section anchor.
				targetParent: target.anchor,
				scenario: target.scenario,
				removalBase,
				targetInstance: target.targetInstance,
				report,
				decisions,
				keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
				decisionMappings: target.resolution?.mappings,
			})
			return { verb: 'ssd', applications, functions }
		}
		case 'asd': {
			const { applications, functions } = await updateAsd(tx, {
				sourceQuery: target.sourceQuery,
				applicationRef: target.ref,
				targetParent: target.anchor,
				scenario: target.scenario,
				removalBase,
				targetInstance: target.targetInstance,
				report,
				decisions,
				keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
				decisionMappings: target.resolution?.mappings,
				resolvePlacement: true,
			})
			return { verb: 'asd', applications, functions }
		}
	}
}
