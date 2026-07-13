import { collectComposedFunctionUuids } from '../composed-functions'
import { findInstanceByTemplateUuid } from '../find-instance'
import { reconcileCrossCuttingSatellites } from './cross-cutting-satellites'
import { fsd as updateFsd } from './fsd'
import { reconcileSatellites } from './satellite-reconcile'

import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import {
	asd as instantiateAsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveApplicationSatellites } from '@/v2019C1/extensions/lifecycle/layers/application'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Scl, Config } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type * as Core from '@dialecte/core'

/**
 * `update.fromAsd` — reconcile a project against a (possibly newer) ASD.
 *
 * Same engine as `update.fromFsd`, one layer up (proves `engine.reconcile` is
 * layer-agnostic): if the target already holds an instance of this Application
 * (an `Application` whose `templateUuid` equals the source Application's `uuid`),
 * reconcile the updated template ONTO it; otherwise instantiate it fresh.
 *
 * Two layers, in order:
 *  1. application layer — reconcile the `Application` subtree (roles, allocation
 *     refs, attributes);
 *  2. function-layer cascade (G2) — treat every composed Function the ASD
 *     references as an FSD to update and delegate to `update.fromFsd`
 *     (instantiate-or-reconcile). Verbs compose verbs: a function added by the
 *     newer ASD is instantiated, an existing one is reconciled.
 *
 * `accepted` (optional) gates every write to the accepted decision groups — the
 * application reconcile, the composed-function reconciles, and the first-time
 * instantiate — so the ASD full track honours the user's decisions across both
 * layers.
 */
export async function asd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, applicationRef, targetParent, accepted } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)

	const instance = await findInstanceByTemplateUuid(tx, { tagName: 'Application', sourceUuid })
	if (!instance) {
		// first-time = one added group; gate the whole instantiate on its acceptance
		if (accepted && !accepted.sourceIds.has(applicationRef.id)) return
		await instantiateAsd(tx, { sourceQuery, applicationRef, targetParent })
		return
	}

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
	})

	const satelliteRefs = await resolveApplicationSatellites(sourceQuery, { applicationRef })
	const structure = await resolveTargetStructure(tx, targetParent)
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

	// 2. function-layer cascade
	await cascadeComposedFunctions(tx, { sourceQuery, applicationRef, targetParent, accepted })
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
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, applicationRef, targetParent, accepted } = params
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
		await updateFsd(tx, { sourceQuery, functionRef, targetParent: functionTargetParent, accepted })
	}
}
