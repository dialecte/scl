import { findInstancesUnder } from '../find-instance'
import { reconcileCrossCuttingSatellites } from './cross-cutting-satellites'
import { reconcileCarriedSatellites } from './function-satellites'

import { acceptedRefIds, collisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import {
	fsd as instantiateFsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type { AcceptedIds, CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type {
	DecisionGroup,
	DecisionMap,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `update.fromFsd` — reconcile a project against a (possibly newer) FSD.
 *
 * Unifies instantiate and update (ENGINE.md §4, doc 02 §4: instantiate is the
 * first-time case of update):
 *  - no instance under `targetParent` -> instantiate fresh (`instantiate.fsd`);
 *  - one or more instances (elements whose `templateUuid` equals the source
 *    function's `uuid`) -> reconcile the updated template ONTO EACH.
 *
 * The standard allows several instances of one template under one anchor. The
 * `report` + `decisions` are passed through, and each instance is gated by ONLY
 * its own groups (partitioned by `instanceScopeId`) so the user can update a
 * SUBSET. Both the FSD seam and the ASD composed-function cascade drive it this way.
 */
export async function fsd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		/** Multi-instance gate: partitioned per instance by `instanceScopeId`. */
		report?: DiffReport
		decisions?: DecisionMap
	},
): Promise<void> {
	const { sourceQuery, functionRef, targetParent, report, decisions } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const instances = await findInstancesUnder(tx, { targetParent, tagName: 'Function', sourceUuid })

	const groups = report?.groups ?? []

	if (instances.length === 0) {
		// first-time = one added group; gate the whole instantiate on its acceptance
		const gate = decisions ? acceptedRefIds({ groups, decisions }) : undefined
		const gateOverrides = decisions ? collisionOverrides({ groups, decisions }) : undefined
		if (gate && !gate.sourceIds.has(functionRef.id)) return
		await instantiateFsd(tx, { sourceQuery, functionRef, targetParent, overrides: gateOverrides })
		return
	}

	const structure = await resolveTargetStructure(tx, targetParent)
	for (const instance of instances) {
		const { instanceAccepted, instanceOverrides } = gateFor({
			instanceId: instance.id,
			groups,
			decisions,
		})

		await reconcile(tx, {
			sourceQuery,
			sourceRootRef: functionRef,
			instanceRootRef: instance,
			accepted: instanceAccepted,
			overrides: instanceOverrides,
		})
		// carried satellites (e.g. FunctionCategory) travel with the function group
		await reconcileCarriedSatellites(tx, {
			sourceQuery,
			functionRef,
			instanceRef: instance,
			targetParent,
			accepted: instanceAccepted,
		})
		// cross-cutting satellites (Variable / BehaviorDescription applying to any subtree element)
		await reconcileCrossCuttingSatellites(tx, {
			sourceQuery,
			primaryRef: functionRef,
			instancePrimaryRef: { tagName: 'Function', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
			structure,
			accepted: instanceAccepted,
		})
	}
}

/**
 * The gate for one instance: with `decisions`, derive it from ONLY that instance's
 * groups (source ids are unique within one instance); without, apply everything
 * (fast track).
 */
function gateFor(params: {
	instanceId: string
	groups: DecisionGroup[]
	decisions: DecisionMap | undefined
}): {
	instanceAccepted: AcceptedIds | undefined
	instanceOverrides: CollisionOverrides | undefined
} {
	const { instanceId, groups, decisions } = params
	if (!decisions) return { instanceAccepted: undefined, instanceOverrides: undefined }
	const instanceGroups = groups.filter((group) => group.instanceScopeId === instanceId)
	return {
		instanceAccepted: acceptedRefIds({ groups: instanceGroups, decisions }),
		instanceOverrides: collisionOverrides({ groups: instanceGroups, decisions }),
	}
}
