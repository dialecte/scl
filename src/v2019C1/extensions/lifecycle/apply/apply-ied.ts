import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	firstTimeGroups,
	leftOutRefIds,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { ied as instantiateIed } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveIedInstance } from '@/v2019C1/extensions/lifecycle/layers/ied/resolve-ied-instance'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { reconcileIed } from '@/v2019C1/extensions/lifecycle/update/transaction/ied'

import type { ApplyIedParams } from './apply-ied.types'
import type { AppliedInstance } from './apply.types'
import type { Config } from '@/v2019C1/config'
import type { PlacedIedFileType } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'
import type * as Core from '@dialecte/core'

/**
 * Write the first placement of an IED a report lists (`instantiate.ied`): a template ISD's or an ICD's IED as a new
 * one, an ISD instance's as a fork keeping its identity, an ISD's with the specification it carries beside it, where the
 * consumer mapped its levels and without what the consumer left out, unless the IED's group is skipped; then each report
 * node annotated with what it became. What the report does not offer is refused before anything is written, with
 * `OPTION_NOT_AVAILABLE` (checked again by `instantiate.ied`, so a report applied twice is refused): an IED read from an
 * IID or an SCD, an ISD instance placed other than as a fork, an IED the project already holds, a fork whose IED or
 * specification the project holds an element of by its uuid.
 */
export async function applyIed(
	tx: Core.Transaction<Config>,
	params: ApplyIedParams,
): Promise<AppliedInstance<'IED'>[]> {
	const { target, report, decisions } = params
	const { sourceQuery, ref: iedRef } = target
	const fileType = report.target?.fileType
	// an IED the project holds from this template is updated, never placed a second time
	const updated = await applyIedUpdate(tx, params)
	if (updated) return updated
	const placedType = placedFileType(fileType)

	// the first placement is one group: skipped, nothing is written
	const groups = firstTimeGroups(report, {})
	const gate = acceptedRefIds({ groups, decisions })
	if (!gate.sourceIds.has(iedRef.id)) return []

	const placed = await instantiateIed(tx, {
		sourceQuery,
		iedRef,
		anchor: target.anchor,
		fileType: placedType,
		// the report's default: a placement it made is not placed a second time
		scenario: target.scenario ?? 'template',
		overrides: collisionOverrides({ groups, decisions }),
		keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
		placeholderLineages: params.placeholderLineages,
		decisionMappings: target.resolution?.mappings,
		// what the consumer left out of the specification is not placed
		leftOut: leftOutRefIds({ groups, decisions }).sourceIds,
	})
	// the IED and its specification are placed in one pass: every instance of the report is annotated from it
	const added = sourceToTargetMap(placed.cloneMappings)
	for (const reportInstance of report.instances) {
		if (!reportInstance.rootRef) annotateInstance({ reportInstance, added })
	}
	return [{ ref: placed.iedRef, placement: 'placed' }]
}

/**
 * The update the report lists of the IED of the project placed from the template (`reconcileIed`); undefined when the
 * project holds none (a first placement). A report made for a first placement, or for another instance, is refused
 * with `REPORT_TARGET_MISMATCH` (`meta: { field: 'targetInstance' }`).
 */
async function applyIedUpdate(
	tx: Core.Transaction<Config>,
	params: ApplyIedParams,
): Promise<AppliedInstance<'IED'>[] | undefined> {
	const { target, report, decisions } = params
	const fileType = report.target?.fileType
	const instance = await resolveIedInstance(tx, {
		sourceQuery: target.sourceQuery,
		iedRef: target.ref,
		scenario: target.scenario ?? 'template',
		fileType,
		targetInstance: target.targetInstance,
		operation: 'apply (ied)',
	})
	if (!instance || !fileType) return undefined
	const [reported] = report.instances
	if (reported?.rootRef?.id !== instance.id) {
		throwDialecteError(SCL_ERRORS.REPORT_TARGET_MISMATCH, {
			meta: { field: 'targetInstance' },
			detail: 'apply (ied): the report was not made for the update of the IED the project holds',
		})
	}
	return reconcileIed(tx, {
		policy: scenarioPolicy({ scenario: target.scenario ?? 'template' }),
		sourceQuery: target.sourceQuery,
		iedRef: target.ref,
		anchor: target.anchor,
		instance,
		fileType,
		report,
		decisions,
		removalBase: params.removalBase,
		placeholderLineages: params.placeholderLineages,
		keepNameTypesFrom: target.resolution?.keepNameTypesFrom,
		takeOver: target.resolution?.takeOver,
		decisionMappings: target.resolution?.mappings,
	})
}

/** The type of file an IED is placed from: the report refused another. */
function placedFileType(fileType: SclFileType | undefined): PlacedIedFileType {
	if (fileType === 'ISD' || fileType === 'ICD') return fileType
	return throwDialecteError('ASSERTION_FAILED', {
		detail: `apply (ied): an IED is placed from an ISD or an ICD, not from ${String(fileType)}`,
	})
}
