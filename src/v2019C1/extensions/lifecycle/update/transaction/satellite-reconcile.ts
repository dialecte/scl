import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { findInstanceByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Reconcile each satellite against the target, gated by `accepted`. Generic over
 * the layer: the caller resolves the SOURCE satellite refs and, for removal
 * detection, the TARGET instance refs (`instanceSatelliteRefs`, resolved with the
 * same finder against the instance primary BEFORE the primary reconcile runs, since
 * that reconcile may drop the referring ref). Three cases, matched by `templateUuid`:
 *  - an EXISTING instance -> reconcile-in-place (`engine.reconcile`);
 *  - NO instance yet -> ADD it (clone at source structural level + stamp lineage),
 *    so a newly-referenced satellite travels on update, not only first-time instantiate;
 *  - a TARGET instance the source no longer references -> DELETE it (the coupling
 *    invariant: it rides the primary group), guarded by a whole-target-doc
 *    last-referrer check so a satellite still referenced by ANOTHER primary is kept.
 *
 * Gating: reconcile-in-place + add on `accepted.sourceIds` (the satellite's report
 * companion contributed its source id); delete on `accepted.instanceIds` (its removed
 * companion contributed the instance id).
 */
export async function reconcileSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		satelliteRefs: Scl.Ref<Scl.ElementsOf>[]
		instanceSatelliteRefs?: Scl.Ref<Scl.ElementsOf>[]
		structure: TargetStructure
		accepted?: AcceptedIds
	},
): Promise<void> {
	const { sourceQuery, satelliteRefs, instanceSatelliteRefs, structure, accepted } = params

	for (const satelliteRef of satelliteRefs) {
		const { uuid: sourceUuid } = await sourceQuery.any.getAttributes(satelliteRef)

		const instance = await findInstanceByTemplateUuid(tx, {
			tagName: satelliteRef.tagName,
			sourceUuid,
		})

		if (instance) {
			await reconcile(tx, {
				sourceQuery,
				sourceRootRef: satelliteRef,
				instanceRootRef: instance,
				accepted,
			})
			continue
		}

		// add: no instance yet — gated on the satellite's own acceptance (its report
		// companion contributed its id to the accepted primary group)
		if (accepted && satelliteRef.id && !accepted.sourceIds.has(satelliteRef.id)) continue

		const targetParent = await resolveStructureRef(sourceQuery, satelliteRef, structure)
		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: satelliteRef,
			targetParent,
			strip: false,
		})
		if (clone) await writeIdentity(tx, { mappings: clone.mappings, mode: 'stamp-template' })
	}

	// delete: a target instance satellite whose template ELEMENT was removed from the
	// source. Catalog/shared satellites (FunctionCategory, AllocationRole, Variable,
	// BehaviorDescription — 90-30 §11-13) persist when merely un-referenced, so the
	// trigger is source-element non-existence, NOT a dropped link.
	for (const instanceRef of instanceSatelliteRefs ?? []) {
		const { templateUuid } = await tx.any.getAttributes(instanceRef)
		if (!templateUuid) continue

		const [stillInSource] = await sourceQuery.any.findByAttributes({
			tagName: instanceRef.tagName,
			attributes: { uuid: templateUuid },
		})
		if (stillInSource) continue

		// gated on the removal companion's acceptance
		if (accepted && instanceRef.id && !accepted.instanceIds.has(instanceRef.id)) continue

		// shared-safety: keep if any OTHER primary still references this satellite
		const referrers = await findRefsPointingTo(tx, { target: instanceRef })
		if (referrers.length > 0) continue

		await tx.delete(instanceRef)
	}
}
