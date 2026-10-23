import { toRef } from '@dialecte/core/helpers'

import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import {
	acceptsRemoval,
	classifyUnmatched,
} from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import {
	collectForeignReferenceIds,
	findInstanceByTemplateUuid,
} from '@/v2019C1/extensions/lifecycle/instance'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { DecisionMappings, ResolvedMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
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
		/** The scenario's key an instance of a satellite carries its source satellite's uuid in. */
		matchKey: MatchKey
		/** The scenario's identity for an added satellite. */
		identityMode: ScenarioPolicy['identityMode']
		/** A shared element created here whose name its level holds is numbered. */
		bumpsCollisions: boolean
		/** What tells a satellite the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** Where the shared satellites land, by source record id. */
		resolvedMappings?: ResolvedMappings
		/** The consumer's choices for the shared satellites, by source record id. */
		decisionMappings?: DecisionMappings
		/**
		 * What belongs to the other instances of the template the satellites are reconciled for: a
		 * shared satellite's references to it are theirs, not this instance's.
		 */
		resolveForeignScope?: ResolveForeignScope
		/** The source elements the instance's selection of functional variants leaves out: see `reconcile`. */
		notSelected?: ReadonlySet<string>
	},
): Promise<Scl.CloneMapping[]> {
	const {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		structure,
		accepted,
		matchKey,
		identityMode,
		bumpsCollisions,
		removalBase,
		namesFollow,
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
			const foreignScope = await params.resolveForeignScope?.()
			const foreignInstanceIds = await collectForeignReferenceIds(tx, {
				sharedRootRef: instance,
				foreignScope: foreignScope ?? new Set(),
			})
			const reconcileMappings = await reconcile(tx, {
				sourceQuery,
				sourceRootRef: satelliteRef,
				instanceRootRef: instance,
				accepted,
				matchKey,
				identityMode,
				bumpsCollisions,
				removalBase,
				namesFollow,
				instanceRootIsProjectOwned: resolved?.projectOwned ?? false,
				keepLeftoverRefs: true,
				foreignInstanceIds,
				notSelected: params.notSelected,
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
			leaveOut: params.notSelected,
		})
		if (!clone) continue
		await finalizeClonedIdentity(tx, { cloneMappings: clone.mappings, mode: identityMode })
		added.push(...clone.mappings)

		// a shared element created here is validated against its structural level: the chosen
		// name is applied, and a name already taken there is bumped to a free one
		if (resolved && bumpsCollisions) {
			const decision = satelliteRef.id ? decisionMappings?.get(satelliteRef.id) : undefined
			const chosenName = decision && 'create' in decision ? decision.create.name : undefined
			await resolvePlacementCollision(tx, {
				ref: toRef(clone.record) as Scl.Ref<Scl.ElementsOf>,
				parentRef: targetParent,
				overrides: chosenName ? { name: chosenName } : undefined,
			})
		}
	}

	// delete: a target instance satellite whose source ELEMENT the source no longer holds — dropped
	// by it, or the project's own. Catalog/shared satellites (FunctionCategory, AllocationRole,
	// Variable, BehaviorDescription) persist when merely un-referenced, so the trigger is
	// source-element non-existence, NOT a dropped link.
	for (const instanceRef of instanceSatelliteRefs ?? []) {
		if (instanceRef.id && mappedOntoIds.has(instanceRef.id)) continue
		const lineage = await tx.any.getAttribute(instanceRef, { name: matchKey })
		if (!lineage) continue

		const [stillInSource] = await sourceQuery.any.findByAttributes({
			tagName: instanceRef.tagName,
			attributes: { uuid: lineage },
		})
		const unmatched = classifyUnmatched({
			lineage,
			inSource: stillInSource !== undefined,
			removalBase,
		})
		if (unmatched === 'still-held') continue

		// a removal is gated on its companion's acceptance; the project's own goes only on an explicit accept
		if (!acceptsRemoval({ change: unmatched, id: instanceRef.id ?? '', accepted })) continue

		// shared-safety: keep if any OTHER primary still references this satellite
		const referrers = await findRefsPointingTo(tx, { target: instanceRef })
		if (referrers.length > 0) continue

		await tx.delete(instanceRef)
	}

	return added
}
