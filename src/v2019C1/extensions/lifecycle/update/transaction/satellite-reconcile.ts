import { toRef } from '@dialecte/core/helpers'

import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { findInstanceByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'

import type { Config, Scl } from '@/v2019C1/config'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction/write-identity.types'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionMappings, ResolvedMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Reconcile each satellite against the target, gated by `accepted`. Generic over
 * the layer: the caller resolves the SOURCE satellite refs and, for removal
 * detection, the TARGET instance refs (`instanceSatelliteRefs`, resolved with the
 * same finder against the instance primary BEFORE the primary reconcile runs, since
 * that reconcile may drop the referring ref). A shared element lands where its mapping resolved
 * (`resolvedMappings`, the answer the report read too); any other satellite is matched by
 * `templateUuid`. Three cases:
 *  - an EXISTING element -> reconcile-in-place (`engine.reconcile`); when it is the project's
 *    own (a shared element mapped onto it), only what the source contributes below it;
 *  - NOTHING yet -> ADD it (clone at source structural level + stamp lineage),
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
		/** `templateUuid` (default) or `uuid` (fork) match for the satellite instance. */
		matchKey?: MatchKey
		/** `stamp-template` (default) or `keep` (fork) identity for an added satellite. */
		identityMode?: IdentityMode
		/** Where the shared satellites land, by source record id. */
		resolvedMappings?: ResolvedMappings
		/** The consumer's choices for the shared satellites, by source record id. */
		decisionMappings?: DecisionMappings
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		structure,
		accepted,
		matchKey = 'templateUuid',
		identityMode = 'stamp-template',
		resolvedMappings,
		decisionMappings,
	} = params

	// project elements a source satellite lands on: in use by the template, never deleted below
	const mappedOntoIds = new Set<string>()
	for (const resolved of resolvedMappings?.values() ?? []) {
		if (resolved.existing) mappedOntoIds.add(resolved.existing.id)
	}

	// the clone mappings of every satellite element added here (see `annotateInstance`)
	const added: Scl.CloneMapping[] = []

	for (const satelliteRef of satelliteRefs) {
		const { uuid: sourceUuid } = await sourceQuery.any.getAttributes(satelliteRef)

		const resolved = satelliteRef.id ? resolvedMappings?.get(satelliteRef.id) : undefined
		const instance = resolved
			? resolved.existing
			: await findInstanceByTemplateUuid(tx, {
					tagName: satelliteRef.tagName,
					sourceUuid,
					matchKey,
				})

		if (instance) {
			const reconcileMappings = await reconcile(tx, {
				sourceQuery,
				sourceRootRef: satelliteRef,
				instanceRootRef: instance,
				accepted,
				matchKey,
				identityMode,
				instanceRootIsProjectOwned: resolved?.projectOwned ?? false,
				keepLeftoverRefs: true,
			})
			added.push(...reconcileMappings)
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
		if (!clone) continue
		await finalizeClonedIdentity(tx, { cloneMappings: clone.mappings, mode: identityMode })
		added.push(...clone.mappings)

		// a shared element created here is validated against its structural level: the chosen
		// name is applied, and a name already taken there is bumped to a free one
		if (resolved && identityMode !== 'keep') {
			const decision = satelliteRef.id ? decisionMappings?.get(satelliteRef.id) : undefined
			const chosenName = decision && 'create' in decision ? decision.create.name : undefined
			await resolvePlacementCollision(tx, {
				ref: toRef(clone.record) as Scl.Ref<Scl.ElementsOf>,
				parentRef: targetParent,
				overrides: chosenName ? { name: chosenName } : undefined,
			})
		}
	}

	// delete: a target instance satellite whose template ELEMENT was removed from the
	// source. Catalog/shared satellites (FunctionCategory, AllocationRole, Variable,
	// BehaviorDescription) persist when merely un-referenced, so the
	// trigger is source-element non-existence, NOT a dropped link.
	for (const instanceRef of instanceSatelliteRefs ?? []) {
		if (instanceRef.id && mappedOntoIds.has(instanceRef.id)) continue
		const lineage = await tx.any.getAttribute(instanceRef, { name: matchKey })
		if (!lineage) continue

		const [stillInSource] = await sourceQuery.any.findByAttributes({
			tagName: instanceRef.tagName,
			attributes: { uuid: lineage },
		})
		if (stillInSource) continue

		// gated on the removal companion's acceptance
		if (accepted && instanceRef.id && !accepted.instanceIds.has(instanceRef.id)) continue

		// shared-safety: keep if any OTHER primary still references this satellite
		const referrers = await findRefsPointingTo(tx, { target: instanceRef })
		if (referrers.length > 0) continue

		await tx.delete(instanceRef)
	}

	return added
}
