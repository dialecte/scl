import { resolveAppliedSatellites } from './applied-satellites'

import { findMappingPolicy, resolveMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import {
	cloneTree,
	mergeChildrenInto,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type {
	CloneAppliedSatellitesParams,
	CloneAppliedSatellitesResult,
} from './clone-applied-satellites.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

/**
 * Places the external CROSS-CUTTING satellites (e.g. `Variable`,
 * `BehaviorDescription`) that apply to any element in the primary subtree. Tag-agnostic: whatever
 * `resolveAppliedSatellites` returns is placed by its own tag. Satellites living
 * inside the subtree are cloned by `deep`, not here (the resolver excludes them).
 *
 * Each is a SHARED element: where it lands is the answer of its mapping (`resolveMapping`, the one
 * the report reads too). Mapped onto an element the target already holds, it is not cloned: its
 * referencing children (`VariableApplyTo`, `InputVar`/`OutputVar`, ...) are merged into that
 * element - skipping it would drop the application to the newly-placed element. With nothing to
 * map onto, it is cloned at its source structural level.
 *
 * UUID remapping is the caller's responsibility via `reference.applyUuidRemap`, over the returned
 * clone mappings and redirect mappings; the caller stamps lineage via `writeIdentity`.
 */
export async function cloneAppliedSatellites(
	tx: Core.Transaction<Config>,
	params: CloneAppliedSatellitesParams,
): Promise<CloneAppliedSatellitesResult> {
	const { sourceQuery, primaryRef, structure, strip = true } = params

	const satellites = await resolveAppliedSatellites(sourceQuery, { primaryRef })

	const cloneMappings: Scl.CloneMapping[] = []
	const redirectMappings: RedirectMapping[] = []
	for (const satelliteRef of satellites) {
		const existing = await findMappedSatellite(tx, { sourceQuery, satelliteRef })
		if (existing) {
			const merged = await mergeChildrenInto(tx, {
				sourceQuery,
				source: satelliteRef,
				target: existing,
				strip: false,
			})
			cloneMappings.push(...merged.cloneMappings)
			redirectMappings.push(...merged.redirectMappings)
			const sourceUuid = await sourceQuery.any.getAttribute(satelliteRef, { name: 'uuid' })
			if (sourceUuid) redirectMappings.push({ sourceUuid, target: existing })
			continue
		}

		const targetParent = await resolveStructureRef(sourceQuery, satelliteRef, structure)
		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: satelliteRef,
			targetParent,
			...(strip ? {} : { strip: false as const }),
		})
		if (clone) cloneMappings.push(...clone.mappings)
	}
	return { cloneMappings, redirectMappings }
}

/** The element of the target a source satellite is mapped onto — none when it is to be created. */
async function findMappedSatellite(
	tx: Core.Transaction<Config>,
	params: { sourceQuery: Core.Query<Config>; satelliteRef: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const { sourceQuery, satelliteRef } = params

	const policy = findMappingPolicy(satelliteRef.tagName)
	if (!policy) return undefined

	const { existing } = await resolveMapping(tx, { sourceQuery, sourceRef: satelliteRef, policy })
	return existing
		? ({ tagName: satelliteRef.tagName, id: existing.id } as Scl.Ref<Scl.ElementsOf>)
		: undefined
}
