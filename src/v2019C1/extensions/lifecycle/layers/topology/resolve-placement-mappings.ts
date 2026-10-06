import { collectFrameElements, strictAncestorIds } from './ensure-topology-frame'

import { toRef } from '@dialecte/core/helpers'

import { TEMPLATE_NAME, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'

import type {
	PlacementLevel,
	ResolvePlacementMappingsParams,
} from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionMapping,
	MappingReader,
	ResolvedMapping,
	StoredRef,
} from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS

/** A level as resolved on its own, before it is placed among the others. */
type ResolvedLevel = Omit<PlacementLevel, 'context' | 'parentSourceId'>

type ResolveLevelParams = {
	sourceQuery: Core.Query<Config>
	sourceRef: StoredRef
	/** The project element the level above lands on — none when that one is created. */
	parentTarget?: Scl.Ref<Scl.ElementsOf>
	decision?: DecisionMapping
}

/**
 * Decide where each structural level of a template lands in the project — the ONE answer the
 * report and the apply both read. Levels are resolved top-down, each below the element the level
 * above lands on.
 *
 * A level ABOVE the unit to instantiate is the project's own context. The first of these that
 * answers wins: the consumer's choice; the level of the element the consumer started from; the
 * only such level there is below the one above. With none it is created; with several, none is
 * picked: it is the consumer's to choose, and every level below waits for that choice.
 *
 * The unit to instantiate and the levels below it are created, under a name free where they
 * land, unless the consumer chose an element of the project.
 *
 * The scope may also be a primary sitting below the levels (the function of an FSD): the levels
 * above it are then all context, and it is no level itself.
 */
export async function resolvePlacementMappings(
	reader: MappingReader,
	params: ResolvePlacementMappingsParams,
): Promise<PlacementLevel[]> {
	const { sourceQuery, scopeRef, anchor, decisionMappings } = params

	const frameElements = await collectFrameElements(sourceQuery, scopeRef)
	const contextIds = await strictAncestorIds(sourceQuery, scopeRef)
	const anchorChain = await resolveTargetStructure(reader, anchor)
	const [documentRoot] = await reader.getRecordsByTagName('SCL')

	const levels: PlacementLevel[] = []
	for (const frameElement of frameElements) {
		const sourceId = frameElement.id
		// the scope may be a primary placed below the levels (a function): it is no level itself
		if (!sourceId || !STRUCTURAL_TAGS.includes(frameElement.tagName)) continue
		const sourceRef: StoredRef = { ...frameElement, id: sourceId }

		const parentLevel = await findParentLevel({ sourceQuery, sourceRef, levels })
		const context = contextIds.has(sourceId)
		// where the level above lands is not decided: nothing can be said of this one yet
		if (parentLevel?.undecided) {
			levels.push({
				...undecidedLevel({ sourceRef, ambiguous: false }),
				context,
				parentSourceId: parentLevel.sourceRef.id,
			})
			continue
		}
		const parentTarget = parentLevel
			? parentLevel.resolved.existing && toRef(parentLevel.resolved.existing)
			: toRef(documentRoot)
		const levelParams: ResolveLevelParams = {
			sourceQuery,
			sourceRef,
			parentTarget: parentTarget as Scl.Ref<Scl.ElementsOf> | undefined,
			decision: decisionMappings?.get(sourceId),
		}

		const level = context
			? await resolveContextLevel(reader, { ...levelParams, anchorChain })
			: await resolveUnitLevel(reader, levelParams)
		levels.push({ ...level, context, parentSourceId: parentLevel?.sourceRef.id })
	}
	return levels
}

/** The level, already resolved, of the nearest structural ancestor of a source level. */
async function findParentLevel(params: {
	sourceQuery: Core.Query<Config>
	sourceRef: StoredRef
	levels: readonly PlacementLevel[]
}): Promise<PlacementLevel | undefined> {
	const { sourceQuery, sourceRef, levels } = params

	const ancestors = await sourceQuery.findAncestors(sourceRef, { stopAtTagName: 'Substation' })
	for (const ancestor of ancestors) {
		const level = levels.find((candidate) => candidate.sourceRef.id === ancestor.id)
		if (level) return level
	}
	return undefined
}

/** A level above the unit to instantiate: an element of the project when one can be told. */
async function resolveContextLevel(
	reader: MappingReader,
	params: ResolveLevelParams & { anchorChain: TargetStructure },
): Promise<ResolvedLevel> {
	const { sourceRef, parentTarget, decision, anchorChain } = params

	const chosen = await resolveChosenLevel(reader, params)
	if (chosen) return chosen
	if (decision || !parentTarget) return createdLevel({ ...params, ambiguous: false })

	const siblings = await reader.any.getChildren(parentTarget, sourceRef.tagName)

	const anchorLevel = anchorChain[sourceRef.tagName as keyof TargetStructure]
	const anchored = anchorLevel && siblings.find((sibling) => sibling.id === anchorLevel.id)
	if (anchored) return existingLevel({ ...params, existing: anchored, reason: 'anchor' })

	if (siblings.length === 1) {
		return existingLevel({ ...params, existing: siblings[0], reason: 'only' })
	}
	if (siblings.length > 1) return undecidedLevel({ sourceRef, parentTarget, ambiguous: true })
	return createdLevel({ ...params, ambiguous: false })
}

/** The unit to instantiate, or a level below it: created unless the consumer chose otherwise. */
async function resolveUnitLevel(
	reader: MappingReader,
	params: ResolveLevelParams,
): Promise<ResolvedLevel> {
	const chosen = await resolveChosenLevel(reader, params)
	if (chosen) return chosen
	return createdLevel({ ...params, ambiguous: false })
}

/** The element of the project the consumer chose for a level, when it chose one. */
async function resolveChosenLevel(
	reader: MappingReader,
	params: ResolveLevelParams,
): Promise<ResolvedLevel | undefined> {
	const { decision } = params
	if (!decision || !('existing' in decision)) return undefined

	const existing = await reader.any.getRecord(decision.existing)
	if (!existing) return undefined
	return existingLevel({ ...params, existing, reason: 'decision' })
}

function existingLevel(
	params: ResolveLevelParams & { existing: AnyTrackedRecord; reason: ResolvedMapping['reason'] },
): ResolvedLevel {
	const { sourceRef, parentTarget, existing, reason } = params
	return {
		sourceRef,
		parentTarget,
		resolved: {
			existing,
			reason,
			ambiguous: false,
			locked: false,
			projectOwned: true,
			undecided: false,
		},
		undecided: false,
	}
}

/**
 * A level nothing is decided for: several levels of the project qualify (`ambiguous`), or the level
 * above is not decided itself.
 */
function undecidedLevel(params: {
	sourceRef: StoredRef
	parentTarget?: Scl.Ref<Scl.ElementsOf>
	ambiguous: boolean
}): ResolvedLevel {
	const { sourceRef, parentTarget, ambiguous } = params
	return {
		sourceRef,
		parentTarget,
		resolved: { reason: 'none', ambiguous, locked: false, projectOwned: false, undecided: true },
		undecided: true,
	}
}

/**
 * A level to create, under the name the consumer asked for, else its own — a `TEMPLATE` level has
 * none, it is named after its kind. Apply makes it free below the element it lands under.
 */
async function createdLevel(
	params: ResolveLevelParams & { ambiguous: boolean },
): Promise<ResolvedLevel> {
	const { sourceQuery, sourceRef, parentTarget, decision, ambiguous } = params

	const requestedName = decision && 'create' in decision ? decision.create.name : undefined
	const sourceName = await sourceQuery.any.getAttribute(sourceRef, { name: 'name' })
	const ownName = sourceName === TEMPLATE_NAME ? sourceRef.tagName : sourceName
	const createName = requestedName ?? ownName ?? sourceRef.tagName

	return {
		sourceRef,
		parentTarget,
		resolved: {
			reason: decision ? 'decision' : 'none',
			ambiguous,
			locked: false,
			projectOwned: false,
			undecided: false,
		},
		createName,
		undecided: false,
	}
}
