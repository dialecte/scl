import { toRef } from '@dialecte/core/helpers'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { finalizeClonedIdentity } from '@/v2019C1/extensions/lifecycle/cross-cutting/finalize-cloned-identity'
import { reconcile } from '@/v2019C1/extensions/lifecycle/engine/reconcile'
import { acceptsRemoval } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { collectForeignReferenceIds } from '@/v2019C1/extensions/lifecycle/instance'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Config, Scl } from '@/v2019C1/config'
import type { AcceptedIds } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type {
	DecisionMappings,
	ResolvedMappings,
	SatelliteRemoval,
} from '@/v2019C1/extensions/lifecycle/mapping'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Reconcile each satellite against the target, gated by `accepted`. Generic over
 * the layer: the caller resolves the SOURCE satellite refs and, for removals, what
 * goes of the instance's satellites (`removals`, read from the instance BEFORE the
 * primary reconcile runs, since that reconcile may drop the referring ref — the answer
 * the report listed). A shared element lands where its mapping resolved
 * (`resolvedMappings`, the answer the report read too); a satellite the instance holds its own of
 * (no mapping policy) is the one listed there for it, else new to the instance. Three cases:
 *  - an EXISTING element -> reconcile-in-place (`engine.reconcile`); when it is the project's
 *    own (a shared element mapped onto it), only what the source contributes below it;
 *  - NOTHING yet -> ADD it (clone at source structural level + stamp lineage),
 *    so a newly-referenced satellite travels on update, not only first-time instantiate;
 *  - a TARGET instance the source no longer references -> DELETE it (the coupling
 *    invariant: it rides the primary group), or only what the instance gave it while
 *    something outside the instance names it.
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
		/** What goes of the satellites of the instance the template no longer brings anything for: see `resolveSatelliteRemovals`. */
		removals: readonly SatelliteRemoval[]
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
		/** Where the source satellites land, by source record id (`resolveSatelliteMappings`). */
		resolvedMappings: ResolvedMappings
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
		removals,
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

	// the clone mappings of every satellite element added here (see `annotateInstance`)
	const added: Scl.CloneMapping[] = []

	for (const satelliteRef of satelliteRefs) {
		const resolved = satelliteRef.id ? resolvedMappings.get(satelliteRef.id) : undefined
		const instance = resolved?.existing

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

		// a satellite created here is validated against its structural level: the name chosen for a
		// shared one is applied, and a name already taken there is bumped to a free one
		if (bumpsCollisions) {
			const decision = satelliteRef.id ? decisionMappings?.get(satelliteRef.id) : undefined
			const chosenName = decision && 'create' in decision ? decision.create.name : undefined
			await placeUniquely(tx, {
				ref: toRef(clone.record) as Scl.Ref<Scl.ElementsOf>,
				parentRef: targetParent,
				overrides: chosenName ? { name: chosenName } : undefined,
			})
		}
	}

	// delete: what goes of a satellite of the instance the template no longer brings anything for,
	// as the report listed it — the element when its removal is accepted, else each reference the
	// instance gave it whose removal is (two instances updated in one apply: the second one's
	// references follow the report even once the first one's are gone)
	for (const { satellite, change, whole, contributions } of removals) {
		if (whole && acceptsRemoval({ change, id: satellite.id, accepted })) {
			if (await tx.any.getRecord(satellite)) await tx.any.delete(satellite)
			continue
		}
		for (const contribution of contributions) {
			if (!acceptsRemoval({ change, id: contribution.id, accepted })) continue
			if (await tx.any.getRecord(contribution)) await tx.any.delete(contribution)
		}
	}

	return added
}
