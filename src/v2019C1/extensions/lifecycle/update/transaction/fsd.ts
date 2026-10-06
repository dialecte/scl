import { reconcileCrossCuttingSatellites } from './cross-cutting-satellites'
import { reconcileCarriedSatellites } from './function-satellites'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	firstTimeGroups,
	firstTimeReportInstance,
	groupsForInstance,
	reportInstanceById,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import {
	findInstancesUnder,
	foreignScopeResolver,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import {
	fsd as instantiateFsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	identityModeForScenario,
	matchKeyForScenario,
} from '@/v2019C1/extensions/lifecycle/scenario'

import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	AcceptedIds,
	CollisionOverrides,
} from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type {
	DecisionGroup,
	DecisionMap,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

/**
 * `update.fromFsd` — reconcile a project against a (possibly newer) FSD.
 *
 * Unifies instantiate and update (instantiate is the first-time case of update):
 *  - no instance under `targetParent` -> instantiate fresh (`instantiate.fsd`);
 *  - one or more instances (elements whose `templateUuid` equals the source
 *    function's `uuid`) -> reconcile the updated template ONTO EACH.
 *
 * The standard allows several instances of one template under one anchor. The
 * `report` + `decisions` are passed through, and each instance is gated by ONLY
 * its own groups (partitioned by `instanceScopeId`) so the user can update a
 * SUBSET. Both the FSD surface and the ASD composed-function cascade drive it this way.
 */
export async function fsd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: FsdFunctionRef
		targetParent: Scl.Ref<Scl.ElementsOf>
		/** `instantiate` forces a fresh instance; `template` (default) reconciles. */
		scenario?: LifecycleScenario
		/** Multi-instance gate: partitioned per instance by `instanceScopeId`. */
		report?: DiffReport
		decisions?: DecisionMap
		/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
		keepNameTypesFrom?: KeepNameTypesFrom
		/** Multi-instance anchor: scope to ONE target instance (or its subtree). Absent = all. */
		targetInstance?: Scl.Ref<Scl.ElementsOf>
		/** The consumer's choices for the shared elements the function is classified by. */
		decisionMappings?: DecisionMappings
		/** The function is placed by this operation alone (an FSD): see `instantiate.fsd`. */
		resolvePlacement?: boolean
		/** Placed as part of a larger template: see `instantiate.fsd`. */
		partOfTemplate?: boolean
		/**
		 * What a first placement is made for, when the report lists it several times and not by where it
		 * lands (a function an application gained, placed for one instance of the application).
		 * Default: `targetParent`.
		 */
		placedFor?: Scl.Ref<Scl.ElementsOf>
	},
): Promise<(Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]> {
	const {
		sourceQuery,
		functionRef,
		targetParent,
		scenario,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
	} = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const matchKey = matchKeyForScenario(scenario)
	const identityMode = identityModeForScenario(scenario)
	// `instantiate` always places a NEW instance, so it never matches an existing one.
	const matched =
		scenario === 'instantiate'
			? []
			: await findInstancesUnder(tx, { targetParent, tagName: 'Function', sourceUuid, matchKey })
	const instances = await scopeToTargetInstance(tx, { instances: matched, targetInstance })

	if (instances.length === 0) {
		// first-time = one added group; gate the whole instantiate on its acceptance — the groups of
		// this place when the report lists the placement per place
		const placedFor = params.placedFor ?? targetParent
		const placementGroups = firstTimeGroups(report, { placedFor })
		const gate = decisions ? acceptedRefIds({ groups: placementGroups, decisions }) : undefined
		const gateOverrides = decisions
			? collisionOverrides({ groups: placementGroups, decisions })
			: undefined
		if (gate && !gate.sourceIds.has(functionRef.id)) return []
		const { functionRef: root, cloneMappings } = await instantiateFsd(tx, {
			sourceQuery,
			functionRef,
			targetParent,
			overrides: gateOverrides,
			keepNameTypesFrom,
			decisionMappings: params.decisionMappings,
			resolvePlacement: params.resolvePlacement,
			partOfTemplate: params.partOfTemplate,
		})
		// annotate the first-time instance's report nodes with what each source element became
		const firstTime = firstTimeReportInstance(report, {
			sourceRootId: functionRef.id,
			placedFor,
		})
		if (firstTime)
			annotateInstance({ reportInstance: firstTime, added: sourceToTargetMap(cloneMappings) })
		return [root]
	}

	const structure = await resolveTargetStructure(tx, targetParent)
	for (const instance of instances) {
		const { instanceAccepted, instanceOverrides } = gateFor({
			instanceGroups: groupsForInstance(report, instance.id),
			decisions,
		})

		const reconcileMappings = await reconcile(tx, {
			sourceQuery,
			sourceRootRef: functionRef,
			instanceRootRef: instance,
			accepted: instanceAccepted,
			overrides: instanceOverrides,
			keepNameTypesFrom,
			matchKey,
			identityMode,
		})
		// an element the instances share (a category) holds one reference per instance: this one
		// reconciles its own, as the project stands once the earlier instances are updated
		const resolveForeignScope = foreignScopeResolver(tx, {
			instanceRootRef: instance,
			sourceUuid,
			matchKey,
		})
		// carried satellites (e.g. FunctionCategory) travel with the function group
		const carriedMappings = await reconcileCarriedSatellites(tx, {
			sourceQuery,
			functionRef,
			instanceRef: instance,
			targetParent,
			accepted: instanceAccepted,
			matchKey,
			identityMode,
			decisionMappings: params.decisionMappings,
			resolveForeignScope,
		})
		// cross-cutting satellites (Variable / BehaviorDescription applying to any subtree element)
		const cross = await reconcileCrossCuttingSatellites(tx, {
			sourceQuery,
			primaryRef: functionRef,
			instancePrimaryRef: { tagName: 'Function', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
			structure,
			accepted: instanceAccepted,
			matchKey,
			identityMode,
			resolveForeignScope,
		})
		// carry the report->applied correlation onto this instance's report nodes
		const addedMappings = [...reconcileMappings, ...carriedMappings, ...cross.cloneMappings]
		// the references this instance gained may point outside the subtree they were added with:
		// at another element added here, or at an element the instance already holds
		await repointAddedReferences(tx, {
			cloneMappings: addedMappings,
			instanceRootRef: instance,
			matchKey,
			redirectMappings: cross.redirectMappings,
		})
		const reportInstance = reportInstanceById(report, instance.id)
		if (reportInstance) {
			annotateInstance({ reportInstance, added: sourceToTargetMap(addedMappings) })
		}
	}

	return instances.map(
		(instance) => ({ tagName: 'Function', id: instance.id }) as Scl.Ref<'Function'>,
	)
}

/**
 * The gate for one instance: with `decisions`, derive it from ONLY that instance's
 * groups (source ids are unique within one instance); without, apply everything
 * (fast track).
 */
function gateFor(params: { instanceGroups: DecisionGroup[]; decisions: DecisionMap | undefined }): {
	instanceAccepted: AcceptedIds | undefined
	instanceOverrides: CollisionOverrides | undefined
} {
	const { instanceGroups, decisions } = params
	if (!decisions) return { instanceAccepted: undefined, instanceOverrides: undefined }
	return {
		instanceAccepted: acceptedRefIds({ groups: instanceGroups, decisions }),
		instanceOverrides: collisionOverrides({ groups: instanceGroups, decisions }),
	}
}
