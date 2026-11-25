import { applyIed } from './apply-ied'
import { assertReportFits } from './assert-report-fits'
import { recheckAfterApply } from './recheck-after-apply'
import { releaseWrittenImplementation } from './release-written-implementation'

import { assertCopyFits } from '@/v2019C1/extensions/lifecycle/copy/assert-copy-fits'
import { withProgressPhases } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases'
import { APPLY_PROGRESS_PHASES } from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.constants'
import {
	allGroups,
	assertDecisionsCoherent,
	assertNoAcceptedCollision,
	assertRequiredDecisionsTaken,
	clearAnnotations,
	writtenInstanceIds,
} from '@/v2019C1/extensions/lifecycle/engine'
import { resolvePlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import {
	assertMappingsCoherent,
	assertReportMappingsDecided,
} from '@/v2019C1/extensions/lifecycle/mapping'
import {
	assertRevisionBaseFits,
	scenarioPolicy,
} from '@/v2019C1/extensions/lifecycle/scenario-policy'
// the recipes themselves: this run releases what it wrote once, after them (see `releaseWrittenImplementation`)
import { asd as updateAsd } from '@/v2019C1/extensions/lifecycle/update/transaction/asd'
import { fsd as updateFsd } from '@/v2019C1/extensions/lifecycle/update/transaction/fsd'
import { ssd as updateSsd } from '@/v2019C1/extensions/lifecycle/update/transaction/ssd'

import type { AppliedInstances, ApplyResult } from './apply.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	AfterApplyHook,
	LifecycleApplyParams,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	ApplyProgressPhaseKey,
	EnterPhase,
} from '@/v2019C1/extensions/lifecycle/cross-cutting/progress-phases.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.apply` writes what a lifecycle report (instantiate or update from an FSD / ASD /
 * SSD) says: all of it when no decision is needed, only the accepted groups once decisions are
 * given, nothing while decisions are still missing (the report comes back for review).
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
 * An IED's report (`verb: 'ied'`) writes a first placement (the IED of a template ISD or of an ICD placed as a new IED,
 * the IED of an ISD instance file as a fork, an ISD with its specification) or an update: the IED of the project placed
 * from a template ISD, from a newer revision of it (`template`), or the IED of an open ISD, from another version of the
 * same file (`fork`), its specification with it. One read from an IID or an SCD, an ISD instance placed otherwise, a
 * fork into a project whose IED or specification the project holds an element of by its uuid, or a `template` report
 * whose IED, of an ICD, the project already holds, is refused with `OPTION_NOT_AVAILABLE`, nothing written.
 *
 * Returns `{ report, instances }` — the effective report plus the instance roots
 * the write produced/reconciled. Run inside `doc.prepare(tx => tx.lifecycle.apply(...))`
 * for a previewable, reversible dry-run.
 *
 * It reports one progress plan of phases (checking the report, writing, releasing implementation links, the consumer's
 * step): the clones and type imports it runs nest under it, so the bar only moves forward. The commit runs after it,
 * with its own plan; a caller that opens a plan in its transaction body holds both nested under its own.
 *
 * @intent apply a template instantiation or update after review, write a lifecycle report with user decisions, accept or skip changes from a newer FSD/ASD/SSD
 */
export async function apply(
	tx: Core.Transaction<Config>,
	params: LifecycleApplyParams,
): Promise<ApplyResult> {
	return await withProgressPhases(tx, {
		phases: APPLY_PROGRESS_PHASES,
		run: async function applyInPhases(enter) {
			return await applyReport(tx, { params, enter })
		},
	})
}

/** Check the report and the decisions, then write what they say, entering each progress phase as it starts. */
async function applyReport(
	tx: Core.Transaction<Config>,
	context: { params: LifecycleApplyParams; enter: EnterPhase<ApplyProgressPhaseKey> },
): Promise<ApplyResult> {
	const { params, enter } = context
	enter('check')
	const { report } = params
	const decisions = params.resolution?.decisions ?? new Map()
	const decisionMappings = params.resolution?.mappings
	// the report tells what THIS run places: what an earlier run placed is forgotten first, whatever follows
	clearAnnotations({ report })

	// a copy the apply does not offer is refused before the report is read
	await assertCopyFits({ query: tx, target: params })
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
	// a change that cannot be written as suggested is decided by name, never by default
	assertRequiredDecisionsTaken({ groups, decisions })
	// where an element lands that the report leaves to the consumer is chosen before anything is written
	assertReportMappingsDecided({
		reportMappings: report.mappings,
		decisionMappings,
		writtenFor: writtenInstanceIds({ report, decisions }),
	})
	// an addition the report says collides on a key nothing can change is refused before anything is written
	assertNoAcceptedCollision({ groups, decisions })

	try {
		const instances = await writeReport(tx, { params, decisions, enter })
		return { report, instances }
	} catch (error) {
		// the store is rolled back with the transaction: the report points at nothing it wrote
		clearAnnotations({ report })
		throw error
	}
}

/** Write what the report lists, release what names an implementation the project lacks, then run the consumer's step. */
async function writeReport(
	tx: Core.Transaction<Config>,
	context: {
		params: LifecycleApplyParams
		decisions: DecisionMap
		enter: EnterPhase<ApplyProgressPhaseKey>
	},
): Promise<AppliedInstances> {
	const { params, decisions, enter } = context
	const { report } = params
	// what the update holds, read once at its entry, as the report read it; an IED's records it itself
	const removalBase = await resolveRemovalBase({
		policy: scenarioPolicy({ scenario: params.scenario }),
		sourceQuery: params.sourceQuery,
		baseQuery: params.baseQuery,
		...(params.verb === 'ied' ? {} : { target: tx, within: params.ref as Scl.Ref<Scl.ElementsOf> }),
	})
	// the lineages a reference may pair by name on, read once for the whole apply, as the report read them
	const placeholderLineages = await resolvePlaceholderLineages(tx, {
		referencesByName: params.resolution?.referencesByName,
	})
	enter('write')
	const writtenFrom = tx.getStagedOperations().length
	const instances = await runVerb(tx, {
		target: params,
		report,
		decisions,
		removalBase,
		placeholderLineages,
	})

	// what the template brings keeps the implementation it had there: what this run wrote naming a
	// logical node, ExtRef or ExtCtrl the project lacks is released, once everything is written
	enter('release')
	await releaseWrittenImplementation(tx, { from: writtenFrom })

	// the consumer's own step, once everything is written, in the same transaction
	const afterApply = params.resolution?.afterApply
	if (afterApply) {
		enter('consumer')
		await runAfterApply(tx, { afterApply, instances })
	}

	return instances
}

/**
 * Run the consumer's step, then hold what it wrote to the uniqueness rules: an element it created or whose key it
 * changed that shares a key with a sibling is numbered as the engine numbers its own, or refused when nothing in the
 * key can be changed. What it did not touch is left as it is.
 */
async function runAfterApply(
	tx: Core.Transaction<Config>,
	params: { afterApply: AfterApplyHook; instances: AppliedInstances },
): Promise<void> {
	const { afterApply, instances } = params
	const from = tx.getStagedOperations().length
	await afterApply(tx as Scl.Transaction, { instances })
	await recheckAfterApply(tx, { from })
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
		case 'ied':
			return { verb: 'ied', ieds: [] }
	}
}

/**
 * Delegate to the per-layer update, which owns the multi-instance loop: it receives the `report` + `decisions`,
 * partitions the gate per instance, and says of each root it wrote whether it placed or reconciled it.
 */
async function runVerb(
	tx: Core.Transaction<Config>,
	params: {
		target: LifecycleApplyParams
		report: DiffReport
		decisions: DecisionMap
		removalBase: RemovalBase
		placeholderLineages: PlaceholderLineages
	},
): Promise<AppliedInstances> {
	const { target, report, decisions, removalBase, placeholderLineages } = params
	// as the report places it: on the levels its template says, or under the anchor itself (a copy)
	const resolvePlacement =
		scenarioPolicy({ scenario: target.scenario }).placement === 'template-levels'
	switch (target.verb) {
		case 'fsd': {
			const functions = await updateFsd(tx, {
				sourceQuery: target.sourceQuery,
				functionRef: target.ref,
				targetParent: target.anchor,
				scenario: target.scenario,
				removalBase,
				placeholderLineages,
				targetInstance: target.targetInstance,
				report,
				decisions,
				keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
				decisionMappings: target.resolution?.mappings,
				resolvePlacement,
			})
			return { verb: 'fsd', functions }
		}
		case 'ssd': {
			const { applications, functions } = await updateSsd(tx, {
				sourceQuery: target.sourceQuery,
				scopeRef: target.ref,
				targetParent: target.anchor,
				scenario: target.scenario,
				removalBase,
				placeholderLineages,
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
				placeholderLineages,
				targetInstance: target.targetInstance,
				report,
				decisions,
				keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
				decisionMappings: target.resolution?.mappings,
				resolvePlacement,
				sharedFunctions: target.resolution?.sharedFunctions,
			})
			return { verb: 'asd', applications, functions }
		}
		case 'ied': {
			const ieds = await applyIed(tx, {
				target,
				report,
				decisions,
				placeholderLineages,
				removalBase,
			})
			return { verb: 'ied', ieds }
		}
	}
}
