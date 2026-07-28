import { resolveAppliedSatellites } from './applied-satellites'

import {
	cloneTree,
	mergeChildrenInto,
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
 *
 * A satellite whose same-tag/same-name twin already exists in the target IS that
 * shared entity: its referencing children (`VariableApplyTo`, `InputVar`/`OutputVar`,
 * ...) are ADDED to the existing satellite rather than the whole thing being skipped -
 * skipping would drop the application to the newly-instantiated element.
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
		const existing = await findExistingSatelliteByName(tx, sourceQuery, satelliteRef)
		if (existing) {
			const addedMappings = await mergeChildrenInto(tx, {
				sourceQuery,
				source: satelliteRef,
				target: existing,
				strip: false,
			})
			mappings.push(...addedMappings)
			continue
		}

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

/** The existing same-tag, same-name satellite in the target (shared entity), if any. */
async function findExistingSatelliteByName(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	satelliteRef: Scl.Ref<Scl.ElementsOf>,
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const source = await sourceQuery.any.getRecord(satelliteRef)
	if (!source) return undefined

	const name = await sourceQuery.any.getAttribute(source, { name: 'name' })
	if (!name) return undefined

	const [existing] = await tx.any.findByAttributes({
		tagName: satelliteRef.tagName,
		attributes: { name },
	})
	return existing
		? ({ tagName: satelliteRef.tagName, id: existing.id } as Scl.Ref<Scl.ElementsOf>)
		: undefined
}
