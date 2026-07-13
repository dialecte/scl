import { findInstanceByTemplateUuid } from '../find-instance'

import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { resolveCarriedSatellites } from '@/v2019C1/extensions/lifecycle/engine/satellites'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { cloneFunctionCategories } from '@/v2019C1/extensions/lifecycle/layers/function'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide'
import type * as Core from '@dialecte/core'

/**
 * Reconcile each carried satellite (e.g. a `FunctionCategory`) of a function ONTO
 * its existing instance, gated by `accepted` (ENGINE.md §16). The satellite lives
 * OUTSIDE the function subtree, so the function reconcile never reaches it; here
 * it is matched globally by `templateUuid` and reconciled in place. The write is
 * gated exactly like the function's: `reconcile` only touches records whose source
 * id is in `accepted`, so the satellite travels iff its function group is accepted
 * (its report companion contributed that id).
 *
 * A satellite the updated template ADDS (no instance yet — a newly-classified
 * function) is grafted via the clone path (`cloneFunctionCategories` +
 * `writeIdentity`, mirroring `instantiate.fsd`), gated by the function group's
 * acceptance. v1: no satellite deletion.
 */
export async function reconcileCarriedSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		targetParent: Scl.Ref<Scl.ElementsOf>
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, functionRef, targetParent, accepted } = params

	const satellites = await resolveCarriedSatellites(sourceQuery, { primaryRef: functionRef })
	let hasMissing = false
	for (const satelliteRef of satellites) {
		const { uuid: sourceUuid } = await sourceQuery.any.getAttributes(satelliteRef)
		const instance = await findInstanceByTemplateUuid(tx, {
			tagName: satelliteRef.tagName,
			sourceUuid,
		})
		if (!instance) {
			hasMissing = true
			continue
		}

		await reconcile(tx, {
			sourceQuery,
			sourceRootRef: satelliteRef,
			instanceRootRef: instance,
			accepted,
		})
	}

	// graft newly-classified satellites (companions of the function group), gated by
	// the group's acceptance; cloneFunctionCategories is idempotent on already-cloned.
	if (hasMissing && (!accepted || accepted.sourceIds.has(functionRef.id))) {
		const structure = await resolveTargetStructure(tx, targetParent)
		const mappings = await cloneFunctionCategories(tx, {
			sourceQuery,
			functionRef,
			structure,
			stripCategoriesUuid: false,
		})
		await writeIdentity(tx, { mappings, mode: 'stamp-template' })
	}
}
