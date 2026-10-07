import { toRef } from '@dialecte/core/helpers'

import { describeCandidate } from '@/v2019C1/extensions/lifecycle/mapping/describe-mapping'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'

import type { InstancePlacement } from './resolve-instance-levels.types'
import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	MappingCandidate,
	ReportMapping,
} from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
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
 * the unit the instance holds nothing for is new to it and is not listed (a level the template
 * gained is the consumer's choice: {@link describeGainedLevels}).
 */
export async function describeHeldPlacement(
	query: Core.Query<Config>,
	params: {
		/** Where each level of the unit stands for the instance, read once (`resolveInstanceLevels`). */
		placement: InstancePlacement
	},
): Promise<ReportMapping[]> {
	const reportMappings: ReportMapping[] = []
	for (const { sourceRef, level, parentSourceId, projectOwned } of params.placement.held) {
		reportMappings.push({
			id: sourceRef.id,
			tagName: sourceRef.tagName,
			kind: 'level',
			mapping: { existing: level },
			...(projectOwned ? { projectOwned: true as const } : {}),
			reason: 'lineage',
			ambiguous: false,
			selectable: true,
			locked: true,
			candidates: [await describeCandidate(query, level)],
			...(parentSourceId ? { dependsOn: parentSourceId } : {}),
		})
	}
	return reportMappings
}

/**
 * What the report says about the levels the template gained since an instance was placed: one
 * choice per level, for that instance (`placedFor`, `id` scoped to it, `sourceId` the level) —
 * created under the level the instance holds above it by default (`reason: 'none'`), or mapped onto
 * one of the levels of that kind the project holds there and the instance does not.
 */
export async function describeGainedLevels(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/** The level of the project the instance of the unit sits on. */
		frameInstance: Scl.Ref<Scl.ElementsOf>
		/** Where each level of the unit stands for the instance, read once (`resolveInstanceLevels`). */
		placement: InstancePlacement
	},
): Promise<ReportMapping[]> {
	const { gained, held } = params.placement
	const heldLevelIds = new Set(held.map(({ level }) => level.id))

	const reportMappings: ReportMapping[] = []
	for (const { sourceRef, parentLevel, choiceKey, decision } of gained) {
		const candidates: MappingCandidate[] = []
		for (const sibling of await query.any.getChildren(parentLevel, sourceRef.tagName)) {
			// a level the instance already stands on is not another level to land on
			if (heldLevelIds.has(sibling.id)) continue
			candidates.push(await describeCandidate(query, toRef(sibling) as Scl.Ref<Scl.ElementsOf>))
		}
		const sourceName = await params.sourceQuery.any.getAttribute(sourceRef, { name: 'name' })
		const landing = decision ?? { create: { name: sourceName } }
		const parentPath =
			'create' in landing ? (await buildElementPath(query, parentLevel))?.path : undefined
		reportMappings.push({
			id: choiceKey,
			sourceId: sourceRef.id,
			placedFor: params.frameInstance,
			tagName: sourceRef.tagName,
			kind: 'level',
			mapping: landing,
			...(parentPath ? { parentPath } : {}),
			reason: decision ? 'decision' : 'none',
			ambiguous: false,
			selectable: true,
			locked: false,
			candidates: candidates.sort(byPath),
		})
	}
	return reportMappings
}
