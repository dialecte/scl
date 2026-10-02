import { resolvePlacementMappings } from './resolve-placement-mappings'

import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'

import type { PlacementLevel } from './resolve-placement-mappings.types'
import type {
	PrimaryPlacement,
	ResolvePrimaryPlacementParams,
} from './resolve-primary-placement.types'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS

/**
 * Decide where the primaries of a function or application template land.
 *
 * The level a primary sits at in the template is the HIGHEST level it may be placed at. Started at
 * that level or below it, the template lands where the consumer started: nothing to map. Started
 * ABOVE it, the content cannot stay there: each level of the template is resolved top-down
 * ({@link resolvePlacementMappings}) and the primaries land on the level their template says —
 * and the placement is said to be off-level, so the consumer is told.
 *
 * A primary with no level in the template (a function template) may be placed anywhere.
 */
export async function resolvePrimaryPlacement(
	reader: MappingReader,
	params: ResolvePrimaryPlacementParams,
): Promise<PrimaryPlacement> {
	const { sourceQuery, primaryRefs, anchor, decisionMappings } = params

	const anchorChain = await resolveTargetStructure(reader, anchor)
	const anchorRank = deepestRank(Object.keys(anchorChain))

	const levelsById = new Map<string, PlacementLevel>()
	let deepestTemplateRank = -1
	for (const primaryRef of primaryRefs) {
		const sourceAncestors = await sourceQuery.findAncestors(primaryRef, {
			stopAtTagName: 'Substation',
		})
		const templateRank = deepestRank(sourceAncestors.map((ancestor) => ancestor.tagName))
		if (templateRank <= anchorRank) continue
		deepestTemplateRank = Math.max(deepestTemplateRank, templateRank)

		const levels = await resolvePlacementMappings(reader, {
			sourceQuery,
			scopeRef: primaryRef,
			anchor,
			decisionMappings,
		})
		for (const level of levels) levelsById.set(level.sourceRef.id, level)
	}

	if (levelsById.size === 0) return { levels: [] }
	return {
		levels: [...levelsById.values()].sort(byRank),
		offLevel: {
			templateLevel: STRUCTURAL_TAGS[deepestTemplateRank],
			startedFrom: STRUCTURAL_TAGS[anchorRank],
		},
	}
}

/** How deep the deepest structural level among `tagNames` is — `-1` when there is none. */
function deepestRank(tagNames: readonly string[]): number {
	return Math.max(-1, ...tagNames.map((tagName) => STRUCTURAL_TAGS.indexOf(tagName)))
}

function byRank(first: PlacementLevel, second: PlacementLevel): number {
	return (
		STRUCTURAL_TAGS.indexOf(first.sourceRef.tagName) -
		STRUCTURAL_TAGS.indexOf(second.sourceRef.tagName)
	)
}
