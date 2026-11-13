import { assertReportFits } from './assert-report-fits'
import { collectWrittenImplementation } from './collect-written-implementation'
import { recheckAfterApply } from './recheck-after-apply'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { cleanUp } from '@/v2019C1/extensions/clean-up'
import {
	allGroups,
	assertDecisionsCoherent,
	assertNoAcceptedCollision,
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
 * An IED's report (`verb: 'ied'`) is not applied yet: refused with `OPTION_NOT_AVAILABLE`
 * (`meta: { option: 'verb', value: 'ied' }`), nothing written.
 *
 * Returns `{ report, instances }` — the effective report plus the instance roots
 * the write produced/reconciled. Run inside `doc.prepare(tx => tx.lifecycle.apply(...))`
 * for a previewable, reversible dry-run.
 *
 * @intent apply a template instantiation or update after review, write a lifecycle report with user decisions, accept or skip changes from a newer FSD/ASD/SSD
 */
export async function apply(
	tx: Core.Transaction<Config>,
	params: LifecycleApplyParams,
): Promise<ApplyResult> {
	const { report } = params
	const decisions = params.resolution?.decisions ?? new Map()
	const decisionMappings = params.resolution?.mappings
	// the report tells what THIS run places: what an earlier run placed is forgotten first, whatever follows
	clearAnnotations({ report })

	// a report made for another target, or naming what the document no longer holds, is refused whatever the track
	await assertReportFits(tx, { report, target: params, decisionMappings })
	// mapping choices the report cannot honour are refused before any write
	if (decisionMappings)
		assertMappingsCoherent({ reportMappings: report.mappings, decisionMappings })

	// a previous revision only a fork reads: refused whatever the track
	assertRevisionBaseFits({ scenario: params.scenario, baseQuery: params.baseQuery })
	// an IED is reported, not yet written: refused whatever the track
	if (params.verb === 'ied') refuseIedApply()

	// No decisions supplied: the full track waits for a human, nothing is written
	if (!params.resolution?.decisions && report.needsDecisions) {
		return { report, instances: emptyInstances(params.verb) }
	}

	// the gate is always the report's: no decisions = each group at its suggested action. User value edits are honored
	// on either track, a conflict-free instantiate can carry edited editable attributes.
	const groups = allGroups(report)
	assertDecisionsCoherent({ groups, decisions })
	// where an element lands that the report leaves to the consumer is chosen before anything is written
	assertReportMappingsDecided({
		reportMappings: report.mappings,
		decisionMappings,
		writtenFor: writtenInstanceIds({ report, decisions }),
	})
	// an addition the report says collides on a key nothing can change is refused before anything is written
	assertNoAcceptedCollision({ groups, decisions })

	try {
		const instances = await writeReport(tx, { params, decisions })
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
	context: { params: LifecycleApplyParams; decisions: DecisionMap },
): Promise<AppliedInstances> {
	const { params, decisions } = context
	const { report } = params
	// what tells a dropped element from the project's own, read once for the whole apply
	const removalBase = await resolveRemovalBase({
		policy: scenarioPolicy({ scenario: params.scenario }),
		sourceQuery: params.sourceQuery,
		baseQuery: params.baseQuery,
	})
	// the lineages a reference may pair by name on, read once for the whole apply, as the report read them
	const placeholderLineages = await resolvePlaceholderLineages(tx, {
		referencesByName: params.resolution?.referencesByName,
	})
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
	const elements = collectWrittenImplementation(tx, { from: writtenFrom })
	if (elements.length > 0) await cleanUp.transaction.resetLNode(tx, { elements })

	// the consumer's own step, once everything is written, in the same transaction
	const afterApply = params.resolution?.afterApply
	if (afterApply) await runAfterApply(tx, { afterApply, instances })

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

/** An apply of an IED is not offered yet: its report lists what a first placement would add, nothing is written. */
function refuseIedApply(): never {
	return throwDialecteError(SCL_ERRORS.OPTION_NOT_AVAILABLE, {
		meta: { option: 'verb', value: 'ied' },
		detail: 'apply: writing an IED is not available yet, its report only lists what it would add',
	})
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
				resolvePlacement: true,
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
				resolvePlacement: true,
				sharedFunctions: target.resolution?.sharedFunctions,
			})
			return { verb: 'asd', applications, functions }
		}
		case 'ied':
			return refuseIedApply()
	}
}
