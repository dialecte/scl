import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { findInstanceByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	cloneFunctionCategories,
	resolveFunctionSatellites,
} from '@/v2019C1/extensions/lifecycle/layers/function'
import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

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
 * function) is added via the clone path (`cloneFunctionCategories` +
 * `writeIdentity`, mirroring `instantiate.fsd`), gated by the function group's
 * acceptance.
 *
 * A satellite the template RETIRED (its element no longer in the source, matched
 * against the `instance`'s satellites) is DELETED — the coupling invariant: it
 * rides the function group (gated by `accepted.instanceIds`), guarded by a
 * whole-target-doc last-referrer check so a category still referenced by ANOTHER
 * function is kept (shared-satellite safety). Catalog persistence:
 * the trigger is source-element non-existence, NOT a dropped link.
 */
export async function reconcileCarriedSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		instanceRef: AnyRefOrRecord
		targetParent: Scl.Ref<Scl.ElementsOf>
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, functionRef, instanceRef, targetParent, accepted } = params

	const satellites = await resolveFunctionSatellites(sourceQuery, { primaryRef: functionRef })
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

	// add newly-classified satellites (companions of the function group), gated by
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

	// delete: an instance satellite whose template ELEMENT was retired from the source
	// (its uuid no longer exists there). Resolved against the instance's own satellites
	// so a dropped FunctionCatRef doesn't hide it. Gated on the removal companion's
	// acceptance; guarded by a last-referrer check (kept if any other function refs it).
	const instanceSatellites = await resolveFunctionSatellites(tx, {
		primaryRef: { tagName: 'Function', id: instanceRef.id } as Scl.Ref<'Function'>,
	})
	for (const instanceSatelliteRef of instanceSatellites) {
		const { templateUuid } = await tx.any.getAttributes(instanceSatelliteRef)
		if (!templateUuid) continue

		const [stillInSource] = await sourceQuery.any.findByAttributes({
			tagName: instanceSatelliteRef.tagName,
			attributes: { uuid: templateUuid },
		})
		if (stillInSource) continue

		if (accepted && instanceSatelliteRef.id && !accepted.instanceIds.has(instanceSatelliteRef.id)) {
			continue
		}

		const referrers = await findRefsPointingTo(tx, { target: instanceSatelliteRef })
		if (referrers.length > 0) continue

		await tx.delete(instanceSatelliteRef)
	}
}
