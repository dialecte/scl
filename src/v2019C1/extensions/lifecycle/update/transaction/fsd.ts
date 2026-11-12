import {
	readCrossCuttingSatellites,
	reconcileCrossCuttingSatellites,
} from './cross-cutting-satellites'
import { readCarriedSatellites, reconcileCarriedSatellites } from './function-satellites'
import { writesToInstance } from './writes-to-instance'

import { toRef } from '@dialecte/core/helpers'

import {
	annotateInstance,
	sourceToTargetMap,
} from '@/v2019C1/extensions/lifecycle/engine/correlate'
import {
	acceptedRefIds,
	collisionOverrides,
	firstTimeGroups,
	firstTimeReportInstance,
	followsSource,
	groupsForInstance,
	reportInstanceById,
} from '@/v2019C1/extensions/lifecycle/engine/decide'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { resolveRemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import {
	findByOwnUuid,
	findInstancesUnder,
	foreignScopeResolver,
	scopeToTargetInstance,
} from '@/v2019C1/extensions/lifecycle/instance'
import {
	fsd as instantiateFsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	PLACED_FUNCTION_TAGS,
	placedFunctionTag,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import { readTemplateLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import {
	assertRevisionBaseFits,
	scenarioPolicy,
} from '@/v2019C1/extensions/lifecycle/scenario-policy'
import { writeProvenance } from '@/v2019C1/extensions/reference/transaction'

import type { UpdateFsdParams } from './fsd.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { AppliedFunction } from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type {
	AcceptedIds,
	CollisionOverrides,
} from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * `tx.lifecycle.update.fsd` — reconcile a project against a (possibly newer) FSD.
 *
 * Unifies instantiate and update (instantiate is the first-time case of update):
 *  - no instance under `targetParent` -> instantiate fresh (`tx.lifecycle.instantiate.fsd`);
 *  - one or more instances (elements whose `templateUuid` equals the source
 *    function's `uuid`) -> reconcile the updated template ONTO EACH.
 *
 * The standard allows several instances of one template under one anchor. The
 * `report` + `decisions` are passed through, and each instance is gated by ONLY
 * its own groups (partitioned by `instanceScopeId`) so the user can update a
 * SUBSET. Both the FSD surface and the ASD composed-function cascade drive it this way.
 * Returns its roots, each saying how (`placed` for a first placement, `reconciled` for a matched instance). Given
 * decisions, only those it wrote to (a change of it accepted, or its file reference brought to the newer revision);
 * without decisions it writes everything the template brings and returns every instance it matched.
 *
 * @intent update a project from a newer FSD, reconcile Function instances with their template, instantiate or update a function template
 */
export async function fsd(
	tx: Core.Transaction<Config>,
	params: UpdateFsdParams,
): Promise<AppliedFunction[]> {
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
	assertRevisionBaseFits({ scenario, baseQuery: params.baseQuery })
	const policy = scenarioPolicy({ scenario, placesFresh: params.placesFresh })
	const { matchKey, identityMode, bumpsCollisions, namesFollow } = policy
	const removalBase =
		params.removalBase ??
		(await resolveRemovalBase({ policy, sourceQuery, baseQuery: params.baseQuery }))
	// a new instance is placed whatever the project holds: no existing one is matched
	const matched = policy.matchesInstances
		? await findInstancesUnder(tx, {
				targetParent,
				tagName: placedFunctionTag(targetParent),
				sourceUuid,
				matchKey,
			})
		: []
	const instances = await scopeToTargetInstance(tx, { instances: matched, targetInstance })

	// placed keeping the file's uuids: an element of the project already carrying the function's uuid is its instance,
	// wherever it sits — reconciled there, even outside `targetInstance`: a uuid names one element of a file, a second
	// is never placed beside it
	if (instances.length === 0 && policy.placementIdentity === 'keep') {
		const owned = await findByOwnUuid(tx, { tagNames: PLACED_FUNCTION_TAGS, uuid: sourceUuid })
		if (owned.length > 0) {
			return reconcileWhereKept(tx, { params: { ...params, removalBase }, elements: owned })
		}
	}

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
			scenario,
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
		return [{ ref: root, placement: 'placed' }]
	}

	const structure = await resolveTargetStructure(tx, targetParent)
	// the instances this write reconciled: one it wrote nothing to (see `writesToInstance`) is not returned
	const reconciled: AppliedFunction[] = []
	// the template's levels, read once: where they land for each instance is read from it
	const templateLevels = await readTemplateLevels(sourceQuery)
	for (const instance of instances) {
		const instanceRef = toRef(instance) as Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		const instanceGroups = groupsForInstance(report, instance.id)
		const { instanceAccepted, instanceOverrides } = gateFor({ instanceGroups, decisions })

		// the satellites as the report read them, before the reconcile below changes the instance
		const carried = await readCarriedSatellites(tx, {
			templateLevels,
			sourceQuery,
			functionRef,
			instanceRef: instance,
			matchKey,
			removalBase,
			decisionMappings: params.decisionMappings,
			selection: params.selection,
		})
		const crossCutting = await readCrossCuttingSatellites(tx, {
			sourceQuery,
			primaryRef: functionRef,
			instancePrimaryRef: toRef(instance) as Scl.Ref<Scl.ElementsOf>,
			matchKey,
			removalBase,
			selection: params.selection,
			scope: carried.scope,
		})

		const { cloneMappings: reconcileMappings } = await reconcile(tx, {
			sourceQuery,
			sourceRootRef: functionRef,
			instanceRootRef: instance,
			accepted: instanceAccepted,
			overrides: instanceOverrides,
			keepNameTypesFrom,
			matchKey,
			identityMode,
			bumpsCollisions,
			removalBase,
			namesFollow,
			placeholderLineages: params.placeholderLineages,
			notSelected: params.selection?.leftOut,
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
			reading: carried,
			// a category the template gained is written where this instance sits, not where the update was started from
			targetParent: instanceRef,
			accepted: instanceAccepted,
			matchKey,
			identityMode,
			bumpsCollisions,
			removalBase,
			namesFollow,
			placeholderLineages: params.placeholderLineages,
			decisionMappings: params.decisionMappings,
			resolveForeignScope,
			selection: params.selection,
		})
		// cross-cutting satellites (Variable / BehaviorDescription applying to any subtree element)
		const cross = await reconcileCrossCuttingSatellites(tx, {
			sourceQuery,
			reading: crossCutting,
			structure,
			accepted: instanceAccepted,
			matchKey,
			identityMode,
			bumpsCollisions,
			removalBase,
			namesFollow,
			placeholderLineages: params.placeholderLineages,
			resolveForeignScope,
			selection: params.selection,
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
		// the instance now holds this revision of its template: its own reference names it (a function placed as part
		// of a larger template records that template's file, not its own)
		const provenance =
			policy.writesProvenance &&
			!params.partOfTemplate &&
			followsSource({ groups: instanceGroups, decisions })
				? await writeProvenance(tx, {
						sourceQuery,
						target: { anchor: 'function', root: instanceRef },
					})
				: undefined
		if (writesToInstance({ accepted: instanceAccepted, provenanceChanged: provenance?.changed })) {
			reconciled.push({ ref: instanceRef, placement: 'reconciled' })
		}
	}

	return reconciled
}

/**
 * Reconcile the elements of the project carrying the function's uuid where each sits: the update, run from its
 * parent, scoped to it.
 */
async function reconcileWhereKept(
	tx: Core.Transaction<Config>,
	context: { params: UpdateFsdParams; elements: readonly AnyTrackedRecord[] },
): Promise<AppliedFunction[]> {
	const { params, elements } = context
	const reconciled: AppliedFunction[] = []
	for (const element of elements) {
		if (!element.parent) continue
		const where = await fsd(tx, {
			...params,
			targetParent: toRef(element.parent) as Scl.Ref<Scl.ElementsOf>,
			targetInstance: toRef(element) as Scl.Ref<Scl.ElementsOf>,
			placesFresh: false,
			resolvePlacement: false,
		})
		reconciled.push(...where)
	}
	return reconciled
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
