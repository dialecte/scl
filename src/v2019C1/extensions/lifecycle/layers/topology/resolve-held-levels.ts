import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

import type {
	FindHeldLevelParams,
	HeldLevels,
	ResolveHeldLevelsParams,
} from './resolve-held-levels.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS

/**
 * The levels of the project one instance of a template lives on, read from where its elements
 * sit: a level an element of the template sits under stands for the level of the same kind the
 * element of the instance sits under. Several instances of one template each have their own.
 * The first counterpart to tell a level settles it.
 */
export async function resolveHeldLevels(
	reader: MappingReader,
	params: ResolveHeldLevelsParams,
): Promise<HeldLevels> {
	const { sourceQuery, counterparts } = params

	const heldLevels = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const { source, instance } of counterparts) {
		const sourceAncestors = await sourceQuery.findAncestors(source, { stopAtTagName: 'Substation' })
		const instanceAncestors = await reader.findAncestors(instance, { stopAtTagName: 'Substation' })

		for (const sourceLevel of sourceAncestors) {
			if (!STRUCTURAL_TAGS.includes(sourceLevel.tagName) || heldLevels.has(sourceLevel.id)) continue
			const level = instanceAncestors.find((ancestor) => ancestor.tagName === sourceLevel.tagName)
			if (!level) continue
			heldLevels.set(sourceLevel.id, {
				tagName: level.tagName,
				id: level.id,
			} as Scl.Ref<Scl.ElementsOf>)
		}
	}
	return heldLevels
}

/**
 * The level of the project an element of the template belongs on for one instance: the level the
 * instance holds for the nearest level the element sits under. None when the instance holds no
 * level the element sits under.
 */
export async function findHeldLevel(
	sourceQuery: Core.Query<Config>,
	params: FindHeldLevelParams,
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const { sourceRef, heldLevels } = params

	const sourceAncestors = await sourceQuery.findAncestors(sourceRef, {
		stopAtTagName: 'Substation',
	})
	const nearest = sourceAncestors.find((ancestor) => heldLevels.has(ancestor.id))
	return nearest && heldLevels.get(nearest.id)
}
