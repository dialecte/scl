import { collectComposedFunctionUuids } from '../composed-functions'
import { findInstanceByTemplateUuid } from '../find-instance'
import { fsd as updateFsd } from './fsd'

import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import {
	asd as instantiateAsd,
	resolveTargetStructure,
} from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Scl, Config } from '@/v2019C1/config'
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
 */
export async function asd(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
		targetParent: Scl.Ref<Scl.ElementsOf>
	},
): Promise<void> {
	const { sourceQuery, applicationRef, targetParent } = params

	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)

	const instance = await findInstanceByTemplateUuid(tx, { tagName: 'Application', sourceUuid })
	if (!instance) {
		await instantiateAsd(tx, { sourceQuery, applicationRef, targetParent })
		return
	}

	// 1. application layer
	await reconcile(tx, { sourceQuery, sourceRootRef: applicationRef, instanceRootRef: instance })

	// 2. function-layer cascade
	await cascadeComposedFunctions(tx, { sourceQuery, applicationRef, targetParent })
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
	},
): Promise<void> {
	const { sourceQuery, applicationRef, targetParent } = params
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
		await updateFsd(tx, { sourceQuery, functionRef, targetParent: functionTargetParent })
	}
}
