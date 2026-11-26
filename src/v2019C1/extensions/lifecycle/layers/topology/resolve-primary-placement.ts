import {
	existingLevel,
	resolveChosenLevel,
	resolvePlacementMappings,
	undecidedLevel,
} from './resolve-placement-mappings'
import { STRUCTURAL_TAGS } from './resolve-primary-placement.constants'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { isTopologyLevel, readAttribute } from '@/v2019C1/helpers'

import type { PlacementLevel, ResolvedLevel } from './resolve-placement-mappings.types'
import type {
	PrimaryPlacement,
	ResolvePrimaryPlacementParams,
	SourceLevel,
} from './resolve-primary-placement.types'
import type { Scl } from '@/v2019C1/config'
import type { MappingReader, StoredRef } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type { AnyTrackedRecord } from '@dialecte/core'

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
 *
 * With `levels: 'source'` the levels placed are those the primaries sit on in the source instead (a copy): see
 * {@link resolveSourceLevels}.
 */
export async function resolvePrimaryPlacement(
	reader: MappingReader,
	params: ResolvePrimaryPlacementParams,
): Promise<PrimaryPlacement> {
	const { sourceQuery, primaryRefs, anchor, decisionMappings } = params
	if (params.levels === 'source') return { levels: await resolveSourceLevels(reader, params) }

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

/**
 * The levels the primaries sit on in the source, each placing what it holds: one per distinct nearest Substation,
 * VoltageLevel or Bay of a primary, none when they all sit on one (they land where the consumer started). Resolved
 * top-down, each under where the nearest of them above it lands (else the anchor): the consumer's choice; else the
 * element there of the level's tag and name; else that place itself, when it may hold the level's primaries — else the
 * consumer's to choose. A level is never created. One read of the primaries' ancestors, of the anchor, of the elements
 * chosen, and of the children of a tag per place a level lands under, whatever the number of levels. (The read-cost
 * test measures levels all landing under the anchor; a level landing under another level's landing adds one children
 * read per such landing and tag, not measured there.)
 */
async function resolveSourceLevels(
	reader: MappingReader,
	params: ResolvePrimaryPlacementParams,
): Promise<PlacementLevel[]> {
	const { sourceQuery, anchor, decisionMappings } = params

	const sourceLevels = params.sourceLevels ?? (await readSourceLevels(params))
	if (sourceLevels.length <= 1) return []
	const anchorRecord = await reader.any.getRecord(anchor)
	// the elements the consumer chose, read once for every level
	const decided = sourceLevels.flatMap(function decidedOf({ sourceRef }) {
		const decision = decisionMappings?.get(sourceRef.id)
		return decision && 'existing' in decision ? [decision.existing] : []
	})
	const decidedRecords = decided.length > 0 ? await reader.any.getRecords(decided) : []
	const decidedById = new Map(
		decided.map((ref, index) => [ref.id ?? '', decidedRecords[index] ?? undefined] as const),
	)
	// the children of a tag of each place a level lands under, read once for every level landing there
	const childrenOf = new Map<string, AnyTrackedRecord[]>()
	async function readChildren(parent: Scl.Ref<Scl.ElementsOf>, tagName: string) {
		const key = `${parent.id}|${tagName}`
		const known = childrenOf.get(key)
		if (known) return known
		const children = await reader.any.getChildren(parent, tagName as Scl.ElementsOf)
		childrenOf.set(key, children)
		return children
	}

	const levels: PlacementLevel[] = []
	for (const sourceLevel of sourceLevels) {
		const { sourceRef, record, aboveIds, primaryTags } = sourceLevel
		const parentLevel = aboveIds
			.map((id) => levels.find((level) => level.sourceRef.id === id))
			.find((level) => level !== undefined)
		const placed = {
			context: true,
			parentSourceId: parentLevel?.sourceRef.id,
			parentIsCandidate: true,
		} as const
		// where the level above lands is not decided: nothing can be said of this one yet
		if (parentLevel?.undecided) {
			levels.push({ ...undecidedLevel({ sourceRef, ambiguous: false }), ...placed })
			continue
		}
		const parentRecord = parentLevel ? parentLevel.resolved.existing : anchorRecord
		if (!parentRecord) {
			levels.push({ ...undecidedLevel({ sourceRef, ambiguous: true }), ...placed })
			continue
		}
		const parentTarget = {
			tagName: parentRecord.tagName,
			id: parentRecord.id,
		} as Scl.Ref<Scl.ElementsOf>
		const levelParams = {
			sourceQuery,
			sourceRef,
			parentTarget,
			decision: decisionMappings?.get(sourceRef.id),
		}
		const decision = levelParams.decision
		const chosen = await resolveChosenLevel(reader, {
			...levelParams,
			read:
				decision && 'existing' in decision
					? { existing: decidedById.get(decision.existing.id ?? '') }
					: undefined,
		})
		if (chosen) {
			levels.push({ ...chosen, ...placed })
			continue
		}
		const name = readAttribute({ record, name: 'name', defaults: 'none' })
		const children = await readChildren(parentTarget, sourceRef.tagName)
		const named = children.find(
			(child) => readAttribute({ record: child, name: 'name', defaults: 'none' }) === name,
		)
		const resolved: ResolvedLevel = named
			? existingLevel({ ...levelParams, existing: named, reason: 'name' })
			: admitsAll({ parentTag: parentRecord.tagName, primaryTags })
				? existingLevel({ ...levelParams, existing: parentRecord, reason: 'anchor' })
				: undecidedLevel({ sourceRef, parentTarget, ambiguous: true })
		levels.push({ ...resolved, ...placed })
	}
	return levels
}

/**
 * The distinct nearest levels the primaries sit on in the source, top-down (by rank, then as the primaries list them):
 * each with the record ids of the levels above it, nearest first, and the tags and ids of the primaries it holds. One
 * read. The one definition of a source level: the resolver, the copy's landing and its entry checks read it.
 */
export async function readSourceLevels(
	params: Pick<ResolvePrimaryPlacementParams, 'sourceQuery' | 'primaryRefs'>,
): Promise<SourceLevel[]> {
	const { sourceQuery, primaryRefs } = params
	const ancestries = await sourceQuery.findAncestorsOfEach(primaryRefs, {
		stopAtTagName: 'Substation',
	})
	const byId = new Map<string, SourceLevel>()
	primaryRefs.forEach(function collect(primaryRef, index) {
		const [nearest, ...above] = (ancestries[index] ?? []).filter((ancestor) =>
			isTopologyLevel(ancestor.tagName),
		)
		if (!nearest) return
		const known = byId.get(nearest.id)
		if (known) {
			known.primaryTags.add(primaryRef.tagName)
			if (primaryRef.id) known.primaryIds.push(primaryRef.id)
			return
		}
		byId.set(nearest.id, {
			sourceRef: { tagName: nearest.tagName, id: nearest.id } as StoredRef,
			record: nearest,
			aboveIds: above.map((ancestor) => ancestor.id),
			primaryTags: new Set([primaryRef.tagName]),
			primaryIds: primaryRef.id ? [primaryRef.id] : [],
		})
	})
	return [...byId.values()].sort(
		(first, second) =>
			STRUCTURAL_TAGS.indexOf(first.sourceRef.tagName) -
			STRUCTURAL_TAGS.indexOf(second.sourceRef.tagName),
	)
}

/** Whether the definition lets every tag of the primaries sit under a parent of that tag. */
function admitsAll(params: { parentTag: string; primaryTags: ReadonlySet<string> }): boolean {
	const children: readonly string[] =
		SCL_DIALECTE_CONFIG.children[params.parentTag as Scl.ElementsOf] ?? []
	return [...params.primaryTags].every((tagName) => children.includes(tagName))
}
