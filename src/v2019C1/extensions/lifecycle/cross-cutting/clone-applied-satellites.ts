import { resolveAppliedSatellites } from './applied-satellites'

import { toRef } from '@dialecte/core/helpers'

import { placeUniquely } from '@/v2019C1/extensions/lifecycle/constraints'
import { leaveOutOfScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type {
	CloneAppliedSatellitesParams,
	CloneAppliedSatellitesResult,
} from './clone-applied-satellites.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Places the external CROSS-CUTTING satellites (e.g. `Variable`,
 * `BehaviorDescription`) that apply to any element in the primary subtree. Tag-agnostic: whatever
 * `resolveAppliedSatellites` returns is placed by its own tag. Satellites living
 * inside the subtree are cloned by `deep`, not here (the resolver excludes them).
 *
 * Each belongs to the instance placed: it is cloned at its source structural level, never mapped onto
 * nor merged into an element of its name the project holds, applying only to what the placement places
 * (`scope`). When the operation tells placed elements
 * apart (`bumpsCollisions`), a name one of its siblings carries is numbered.
 *
 * UUID remapping is the caller's responsibility via `reference.applyUuidRemap`, over the returned
 * clone mappings; the caller stamps lineage via `writeIdentity`.
 */
export async function cloneAppliedSatellites(
	tx: Core.Transaction<Config>,
	params: CloneAppliedSatellitesParams,
): Promise<CloneAppliedSatellitesResult> {
	const { sourceQuery, primaryRef, structure, leftOut, bumpsCollisions, scope } = params

	const satellites = await resolveAppliedSatellites(sourceQuery, { primaryRef, leftOut })

	const cloneMappings: Scl.CloneMapping[] = []
	for (const satelliteRef of satellites) {
		const targetParent = await resolveStructureRef(sourceQuery, satelliteRef, structure)
		const leaveOut = await leaveOutOfScope(sourceQuery, { root: satelliteRef, scope, leftOut })
		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: satelliteRef,
			targetParent,
			leaveOut,
		})
		if (!clone) continue
		cloneMappings.push(...clone.mappings)
		if (bumpsCollisions) {
			await placeUniquely(tx, {
				ref: toRef(clone.record) as Scl.Ref<Scl.ElementsOf>,
				parentRef: targetParent,
			})
		}
	}
	return { cloneMappings }
}
