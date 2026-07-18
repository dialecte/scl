import { reconcileCrossCuttingSatellites } from './cross-cutting-satellites'
import { fsd as updateFsd } from './fsd'
import { reconcileSatellites } from './satellite-reconcile'

import { acceptedRefIds, collisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { collectComposedFunctionUuids } from '@/v2019C1/extensions/lifecycle/instance'
import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import {
	asd as instantiateAsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveApplicationSatellites } from '@/v2019C1/extensions/lifecycle/layers/application'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * `update.fromAsd` — reconcile a project against a (possibly newer) ASD.
 *
 * Same engine as `update.fromFsd`, one layer up (proves `engine.reconcile` is
 * layer-agnostic): the standard permits several instances of one ASD template
 * under one anchor, so EVERY matching `Application` instance is reconciled; if
 * none exists yet, the application is instantiated fresh.
 *
 * Two layers, in order:
 *  1. application layer — reconcile each `Application` subtree (roles, allocation
 *     refs, attributes);
 *  2. function-layer cascade (G2) — treat every composed Function the ASD
 *     references as an FSD to update and delegate to `update.fromFsd`
 *     (instantiate-or-reconcile), which fans out per composed-function instance.
 *     Verbs compose verbs: a function added by the newer ASD is instantiated, an
 *     existing one is reconciled.
 *
 * `report` + `decisions` gate every write: each Application instance is gated by
 * ONLY its own groups (partitioned by `instanceScopeId`) so the user can update a
 * subset of instances across both layers.
 */
export async function asd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		/** `instantiate` forces a fresh instance; `update` (default) reconciles. */
		scenario?: LifecycleScenario
		report?: DiffReport
		decisions?: DecisionMap
	},
): Promise<void> {
	const { sourceQuery, applicationRef, targetParent, scenario, report, decisions } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)
	// `instantiate` always places a NEW instance, so it never matches an existing one.
	const instances =
		scenario === 'instantiate'
			? []
			: await findInstancesByTemplateUuid(tx, { tagName: 'Application', sourceUuid })
	const groups = report?.groups ?? []

	if (instances.length === 0) {
		// first-time = one added group; gate the whole instantiate on its acceptance
		const gate = decisions ? acceptedRefIds({ groups, decisions }) : undefined
		const gateOverrides = decisions ? collisionOverrides({ groups, decisions }) : undefined
		if (gate && !gate.sourceIds.has(applicationRef.id)) return
		await instantiateAsd(tx, {
			sourceQuery,
			applicationRef,
			targetParent,
			overrides: gateOverrides,
		})
		return
	}

	const structure = await resolveTargetStructure(tx, targetParent)
	const satelliteRefs = await resolveApplicationSatellites(sourceQuery, { applicationRef })

	for (const instance of instances) {
		// gate THIS instance by only its own groups (source ids are unique within one instance)
		const instanceGroups = groups.filter((group) => group.instanceScopeId === instance.id)
		const accepted = decisions ? acceptedRefIds({ groups: instanceGroups, decisions }) : undefined
		const overrides = decisions
			? collisionOverrides({ groups: instanceGroups, decisions })
			: undefined

		// application-layer satellites (e.g. a referenced AllocationRole) travel with the
		// application group. Resolve the instance-side satellites BEFORE the reconcile below
		// (which may drop a satellite ref) so removals are still detectable.
		const instanceSatelliteRefs = await resolveApplicationSatellites(tx, {
			applicationRef: { tagName: 'Application', id: instance.id } as Scl.Ref<'Application'>,
		})

		// 1. application layer
		await reconcile(tx, {
			sourceQuery,
			sourceRootRef: applicationRef,
			instanceRootRef: instance,
			accepted,
			overrides,
		})
		await reconcileSatellites(tx, {
			sourceQuery,
			satelliteRefs,
			instanceSatelliteRefs,
			structure,
			accepted,
		})
		// cross-cutting satellites (Variable / BehaviorDescription) applying to any element
		// in the Application subtree travel with the application group
		await reconcileCrossCuttingSatellites(tx, {
			sourceQuery,
			primaryRef: applicationRef,
			instancePrimaryRef: { tagName: 'Application', id: instance.id } as Scl.Ref<Scl.ElementsOf>,
			structure,
			accepted,
		})
	}

	// 2. function-layer cascade — updateFsd fans out per composed-function instance
	await cascadeComposedFunctions(tx, {
		sourceQuery,
		applicationRef,
		targetParent,
		scenario,
		report,
		decisions,
	})
}

/**
 * Function-layer cascade: treat every composed Function the ASD references as an
 * FSD to update and delegate to `update.fromFsd` (instantiate-or-reconcile).
 *
 * Each function is placed at its own mirrored structural level (resolved exactly
 * like `instantiate.asd`, via `resolveTargetStructure` + `resolveStructureRef`) —
 * not blindly under the ASD's `targetParent` — so a function that lives under a
 * different Substation/VoltageLevel/Bay than the anchor is found/placed correctly.
 */
async function cascadeComposedFunctions(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		scenario?: LifecycleScenario
		report?: DiffReport
		decisions?: DecisionMap
	},
): Promise<void> {
	const { sourceQuery, applicationRef, targetParent, scenario, report, decisions } = params
	const functionUuids = await collectComposedFunctionUuids(sourceQuery, applicationRef)
	if (functionUuids.size === 0) return

	const structure = await resolveTargetStructure(tx, targetParent)

	for (const functionUuid of functionUuids) {
		const [sourceFunction] = await sourceQuery.any.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: functionUuid },
		})
		if (!sourceFunction) continue
		const functionRef = { tagName: 'Function', id: sourceFunction.id } as Scl.Ref<'Function'>
		const functionTargetParent = await resolveStructureRef(sourceQuery, functionRef, structure)
		await updateFsd(tx, {
			sourceQuery,
			functionRef,
			targetParent: functionTargetParent,
			scenario,
			report,
			decisions,
		})
	}
}
