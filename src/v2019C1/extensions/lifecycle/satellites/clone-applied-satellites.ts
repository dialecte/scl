import { resolveAppliedSatellites } from './applied-satellites'

import {
	cloneTree,
	resolveStructureRef,
} from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

/**
 * Clones the external CROSS-CUTTING satellites (e.g. `Variable`,
 * `BehaviorDescription`) that apply to any element in the primary subtree, each
 * placed at its source structural level. Tag-agnostic: whatever
 * `resolveAppliedSatellites` returns is cloned by its own tag. Satellites living
 * inside the subtree are cloned by `deep`, not here (the resolver excludes them).
 * UUID remapping is handled by the afterDeepClone hook; the caller stamps lineage
 * via `writeIdentity`.
 */
export async function cloneAppliedSatellites(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		structure: TargetStructure
		strip?: boolean
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, primaryRef, structure, strip = true } = params

	const satellites = await resolveAppliedSatellites(sourceQuery, { primaryRef })

	const mappings: Scl.CloneMapping[] = []
	for (const satelliteRef of satellites) {
		if (await isAlreadyCloned(tx, sourceQuery, satelliteRef)) continue

		const targetParent = await resolveStructureRef(sourceQuery, satelliteRef, structure)
		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: satelliteRef,
			targetParent,
			...(strip ? {} : { strip: false as const }),
		})
		if (clone) mappings.push(...clone.mappings)
	}
	return mappings
}

/** A same-tag, same-name satellite already present in the target = already cloned (dedup shared). */
async function isAlreadyCloned(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	satelliteRef: Scl.Ref<Scl.ElementsOf>,
): Promise<boolean> {
	const source = await sourceQuery.any.getRecord(satelliteRef)
	if (!source) return false

	const name = await sourceQuery.any.getAttribute(source, { name: 'name' })
	if (!name) return false

	const [existing] = await tx.any.findByAttributes({
		tagName: satelliteRef.tagName,
		attributes: { name },
	})
	return Boolean(existing)
}
