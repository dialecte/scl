import { collectFrameElements, strictAncestorIds } from './ensure-topology-frame'
import { resolveInstanceLevels } from './resolve-instance-levels'

import { toRef } from '@dialecte/core/helpers'

import { describeCandidate } from '@/v2019C1/extensions/lifecycle/mapping/describe-mapping'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'

import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	MappingCandidate,
	ReportMapping,
} from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'

/**
 * What the report says about each structural level of a template: where it lands, why, and the
 * elements of the project it could be mapped onto instead — those below the element the level
 * above lands on, so a choice made for a level changes what the levels below it can be.
 */
export async function describePlacementMappings(
	query: Core.Query<Config>,
	params: { levels: readonly PlacementLevel[] },
): Promise<ReportMapping[]> {
	const reportMappings: ReportMapping[] = []
	// where each level lands, by source record id: an element of the project, or one created here
	const landingPaths = new Map<string, string>()
	for (const level of params.levels) {
		const { sourceRef, parentSourceId, resolved, createName } = level

		const candidates = await listLevelCandidates(query, level)
		const parentPath = await describeParentPath(query, { level, landingPaths })
		const landingPath = await describeLandingPath(query, { level, parentPath })
		if (landingPath) landingPaths.set(sourceRef.id, landingPath)
		const landing = resolved.existing
			? { existing: toRef(resolved.existing) as Scl.Ref<Scl.ElementsOf> }
			: { create: { name: createName } }
		const created = !level.undecided && !resolved.existing

		reportMappings.push({
			id: sourceRef.id,
			tagName: sourceRef.tagName,
			kind: 'level',
			// nothing is decided for the level: it is the consumer's to choose
			...(level.undecided ? {} : { mapping: landing }),
			...(resolved.existing && resolved.projectOwned ? { projectOwned: true as const } : {}),
			...(created && parentPath ? { parentPath } : {}),
			reason: resolved.reason,
			ambiguous: resolved.ambiguous,
			selectable: true,
			locked: resolved.locked,
			candidates,
			...(parentSourceId ? { dependsOn: parentSourceId } : {}),
		})
	}
	return reportMappings
}

/**
 * The path of the element a level lands under: the project element the level above lands on, or
 * the one created for it by this very placement.
 */
async function describeParentPath(
	query: Core.Query<Config>,
	params: { level: PlacementLevel; landingPaths: ReadonlyMap<string, string> },
): Promise<string | undefined> {
	const { level, landingPaths } = params

	if (!level.parentTarget) {
		return level.parentSourceId ? landingPaths.get(level.parentSourceId) : undefined
	}
	const parentElementPath = await buildElementPath(query, level.parentTarget)
	return parentElementPath?.path || undefined
}

/** The path of the element a level lands on, once decided: the project's, or the one to create. */
async function describeLandingPath(
	query: Core.Query<Config>,
	params: { level: PlacementLevel; parentPath: string | undefined },
): Promise<string | undefined> {
	const { level, parentPath } = params
	if (level.undecided) return undefined

	if (level.resolved.existing) {
		const existingRef = toRef(level.resolved.existing) as Scl.Ref<Scl.ElementsOf>
		const elementPath = await buildElementPath(query, existingRef)
		return elementPath?.path || undefined
	}
	if (!level.createName) return undefined
	return parentPath ? `${parentPath}/${level.createName}` : level.createName
}

/** The elements of the project a level could land on: its kind, below where the level above lands. */
async function listLevelCandidates(
	query: Core.Query<Config>,
	level: PlacementLevel,
): Promise<MappingCandidate[]> {
	const { sourceRef, parentTarget } = level
	if (!parentTarget) return []

	const siblings = await query.any.getChildren(parentTarget, sourceRef.tagName)
	const candidates: MappingCandidate[] = []
	for (const sibling of siblings) {
		const candidate = await describeCandidate(query, toRef(sibling) as Scl.Ref<Scl.ElementsOf>)
		candidates.push(candidate)
	}
	return candidates.sort(byPath)
}

function byPath(first: MappingCandidate, second: MappingCandidate): number {
	return first.path.localeCompare(second.path)
}

/**
 * What the report says about the levels an instance of the unit already sits on: where an earlier
 * placement put it. Each is listed as held — shown, not the consumer's to change. A level below
 * the unit the instance holds nothing for is new to it and is not listed.
 */
export async function describeHeldPlacement(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/** The unit of the template: the first named level. */
		scopeRef: Scl.Ref<Scl.ElementsOf>
		/** The level of the project the instance of the unit sits on. */
		frameInstance: Scl.Ref<Scl.ElementsOf>
		matchKey?: MatchKey
	},
): Promise<ReportMapping[]> {
	const { sourceQuery, scopeRef, frameInstance, matchKey } = params

	const frameElements = await collectFrameElements(sourceQuery, scopeRef)
	const contextIds = await strictAncestorIds(sourceQuery, scopeRef)
	const instanceAncestors = await query.findAncestors(frameInstance, {
		stopAtTagName: 'Substation',
	})
	const instanceLevels = await resolveInstanceLevels(query, {
		sourceQuery,
		scopeRef,
		frameInstance,
		matchKey,
	})

	const reportMappings: ReportMapping[] = []
	for (const frameElement of frameElements) {
		const sourceId = frameElement.id
		if (!sourceId) continue

		// a level above the unit: the level of that kind the instance sits below
		const contextLevel = instanceAncestors.find((level) => level.tagName === frameElement.tagName)
		const held = contextIds.has(sourceId)
			? contextLevel && (toRef(contextLevel) as Scl.Ref<Scl.ElementsOf>)
			: instanceLevels.get(sourceId)
		if (!held) continue

		const sourceAncestors = await sourceQuery.findAncestors(frameElement, {
			stopAtTagName: 'Substation',
		})
		const parent = sourceAncestors.find((ancestor) =>
			reportMappings.some((listed) => listed.id === ancestor.id),
		)
		const candidate = await describeCandidate(query, held)
		const projectOwned = await isProjectOwned(query, {
			sourceQuery,
			held,
			sourceRef: frameElement,
			matchKey,
		})
		reportMappings.push({
			id: sourceId,
			tagName: frameElement.tagName,
			kind: 'level',
			mapping: { existing: held },
			...(projectOwned ? { projectOwned: true as const } : {}),
			reason: 'lineage',
			ambiguous: false,
			selectable: true,
			locked: true,
			candidates: [candidate],
			...(parent ? { dependsOn: parent.id } : {}),
		})
	}
	return reportMappings
}

/** A held level is the project's own unless it was created from the source level (its lineage). */
async function isProjectOwned(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		held: Scl.Ref<Scl.ElementsOf>
		sourceRef: Scl.Ref<Scl.ElementsOf>
		matchKey?: MatchKey
	},
): Promise<boolean> {
	const { sourceQuery, held, sourceRef, matchKey = 'templateUuid' } = params
	const sourceUuid = await sourceQuery.any.getAttribute(sourceRef, { name: 'uuid' })
	const lineage = await query.any.getAttribute(held, { name: matchKey })
	return !sourceUuid || lineage !== sourceUuid
}
