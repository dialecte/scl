import { updateProcessSection } from './process-section'

import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import { collisionOverrides, leftOutRefIds } from '@/v2019C1/extensions/lifecycle/engine/decide'
import {
	cloneProcessSection,
	settleProcessSection,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction/process-section'
import { readInstanceRedirects } from '@/v2019C1/extensions/lifecycle/layers/ied/instance-redirects'
import { scenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy'

import type { ReconcileIedSpecificationParams } from './ied-specification.types'
import type { Config } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

/**
 * Update the specification of an IED with the newer revision of its template ISD, once the IED's own part is
 * reconciled, as `update.ssd` updates a substation scope (`updateProcessSection`), scoped to the IED's specification:
 * its level, its applications and functions, another placement's on the same level left alone. What the template's
 * LNodes name lands on the IED's logical nodes, those it holds and those the update just gave it, so an LNode the
 * revision gains is bound to the IED updated. Records no provenance: the IED's reference names the revision.
 */
export async function reconcileIedSpecification(
	tx: Core.Transaction<Config>,
	params: ReconcileIedSpecificationParams,
): Promise<void> {
	const { sourceQuery, specification, instanceRef } = params
	const { scope, reconcilables, instance } = specification
	const policy = scenarioPolicy({ scenario: 'template' })
	// the IED's logical nodes as they stand now, those the update gave it included
	const redirectMappings = await readInstanceRedirects(tx, {
		instance: instanceRef,
		matchKey: policy.matchKey,
	})
	if (!instance) {
		await placeIedSpecification(tx, { ...params, redirectMappings })
		return
	}
	await updateProcessSection(tx, {
		sourceQuery,
		targetParent: params.anchor,
		scenario: 'template',
		report: params.report,
		decisions: params.decisions,
		keepNameTypesFrom: params.keepNameTypesFrom,
		placeholderLineages: params.placeholderLineages,
		targetInstance: instance.frames,
		primaryTargets: instance.primaries,
		redirectMappings,
		decisionMappings: params.decisionMappings,
		scope,
		reconcilables,
		policy,
		removalBase: params.removalBase,
	})
}

/**
 * Place the specification of an IED the project holds none of (placed before its file carried one, or with it left
 * out), as a first placement places it (`cloneProcessSection` / `settleProcessSection`, see `instantiate.ied`): its
 * levels where the consumer mapped them, a new instance of each, without what the consumer left out, its LNodes bound to
 * the logical nodes of the IED updated in the one identity pass. Each first-placement instance of the report annotated
 * with what it became.
 */
async function placeIedSpecification(
	tx: Core.Transaction<Config>,
	params: ReconcileIedSpecificationParams & { redirectMappings: readonly RedirectMapping[] },
): Promise<void> {
	const { sourceQuery, specification, report, decisions, instanceRef } = params
	const policy = scenarioPolicy({ scenario: 'instantiate' })
	// the groups of the specification: those of the report's instances other than the IED's
	const groups = (report?.instances ?? [])
		.filter((reportInstance) => reportInstance.rootRef?.id !== instanceRef.id)
		.flatMap((reportInstance) => reportInstance.groups)
	const cloned = await cloneProcessSection(tx, {
		sourceQuery,
		scope: specification.scope,
		targetParent: params.anchor,
		policy,
		decisionMappings: params.decisionMappings,
		leftOut: decisions ? leftOutRefIds({ groups, decisions }).sourceIds : undefined,
		operation: 'apply (ied)',
	})
	if (!cloned) return
	await finalizeClonedIdentity(tx, {
		cloneMappings: cloned.cloneMappings,
		mode: policy.placementIdentity,
		redirectMappings: [...cloned.redirectMappings, ...params.redirectMappings],
	})
	await settleProcessSection(tx, {
		sourceQuery,
		cloned,
		targetParent: params.anchor,
		policy,
		overrides: decisions ? collisionOverrides({ groups, decisions }) : undefined,
		decisionMappings: params.decisionMappings,
		cloneMappings: cloned.cloneMappings,
	})
	const added = sourceToTargetMap(cloned.cloneMappings)
	for (const reportInstance of report?.instances ?? []) {
		if (!reportInstance.rootRef) annotateInstance({ reportInstance, added })
	}
}
