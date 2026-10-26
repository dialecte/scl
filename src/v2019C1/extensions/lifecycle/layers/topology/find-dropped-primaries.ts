import { applicationsUnderScope, functionsUnderScope } from './scope-content'

import { toRef } from '@dialecte/core/helpers'

import { classifyUnmatched } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { carriesOwnProvenance, isLastReferrer } from '@/v2019C1/extensions/lifecycle/instance'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type {
	FindDroppedPrimariesParams,
	UnitPrimaries,
	UnitUuids,
} from './find-dropped-primaries.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { DroppedElement } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The applications and functions an instance of a unit holds that the newer unit no longer does: each dropped by it,
 * or the project's own (`classifyUnmatched`) — the update replaces the unit's applications with those of the newer
 * one. Only what sits on the unit's own levels counts: the level the instance sits on, and the levels below it made
 * from a level of the unit — a level placed there by another template (a bay-typical in a voltage level) is that
 * template's, and a level of the project a level of the unit was mapped onto holds the project's. Left out too: an
 * element with no lineage under the scenario's key, one placed from a file of its own (it records it: an application
 * file, a function file placed there), and a function an application staying in the project still composes. The
 * applications first, then the functions.
 */
export async function findDroppedPrimaries(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: FindDroppedPrimariesParams,
): Promise<DroppedElement[]> {
	const { sourceQuery, scopeRef, frameInstance, matchKey, removalBase } = params

	const sourceUuids = await readUnitUuids(sourceQuery, { scopeRef, leftOut: params.leftOut })
	const frame = await reader.any.getTree(frameInstance)
	if (!frame) return []

	// a level of the project the unit's root was mapped onto carries no lineage of it: what it holds is the project's
	const frameLineage = await reader.any.getAttribute(frame, { name: matchKey })
	const primaries: UnitPrimaries = { applications: [], functions: [] }
	await collectUnitPrimaries(reader, {
		level: frame,
		holdsUnitPrimaries: frameLineage !== undefined && frameLineage === sourceUuids.root,
		levelUuids: sourceUuids.levels,
		matchKey,
		primaries,
	})

	const classify = { sourcePrimaryUuids: sourceUuids.primaries, matchKey, removalBase }
	const dropped = await classifyPrimaries(reader, {
		...classify,
		primaries: primaries.applications,
	})

	// a function composed only by the applications leaving with it goes with them: a removal by the applications
	// removed, the project's own by any of them — an application of the project's own stays unless its removal is
	// accepted, so a removal never waits on it
	const removedIds = new Set(
		dropped.filter(({ change }) => change === 'removed').map(({ element }) => element.id),
	)
	const droppedIds = new Set(dropped.map(({ element }) => element.id))
	const droppedFunctions = await classifyPrimaries(reader, {
		...classify,
		primaries: primaries.functions,
	})
	for (const droppedFunction of droppedFunctions) {
		const lastReferred = await isLastReferrer(reader, {
			target: toRef(droppedFunction.element) as Scl.Ref<Scl.ElementsOf>,
			containerTagName: 'Application',
			leavingIds: droppedFunction.change === 'removed' ? removedIds : droppedIds,
		})
		if (lastReferred) dropped.push(droppedFunction)
	}
	return dropped
}

/**
 * The uuids of the unit's root level, of its levels, and of its primaries (applications, functions), what the scope
 * leaves out aside.
 */
async function readUnitUuids(
	sourceQuery: Core.Query<Config>,
	params: {
		scopeRef: FindDroppedPrimariesParams['scopeRef']
		leftOut: FindDroppedPrimariesParams['leftOut']
	},
): Promise<UnitUuids> {
	const { scopeRef, leftOut } = params
	const root = await sourceQuery.any.getAttribute(scopeRef, { name: 'uuid' })
	const levels = new Set<string>()
	const tree = await sourceQuery.any.getTree(scopeRef)
	if (tree) await collectLevelUuids(sourceQuery, { node: tree, levels, leftOut })

	const primaries = new Set<string>()
	const sourcePrimaries = [
		...(await applicationsUnderScope(sourceQuery, scopeRef)),
		...(await functionsUnderScope(sourceQuery, scopeRef)),
	].filter((primary) => !leftOut.has(primary.id))
	for (const primary of sourcePrimaries) {
		const uuid = await sourceQuery.any.getAttribute(primary, { name: 'uuid' })
		if (uuid) primaries.add(uuid)
	}
	return { root, levels, primaries }
}

async function collectLevelUuids(
	sourceQuery: Core.Query<Config>,
	params: {
		node: AnyTreeRecord
		levels: Set<string>
		leftOut: FindDroppedPrimariesParams['leftOut']
	},
): Promise<void> {
	const { node, levels, leftOut } = params
	if (!isTopologyLevel(node.tagName) || leftOut.has(node.id)) return
	const uuid = await sourceQuery.any.getAttribute(node, { name: 'uuid' })
	if (uuid) levels.add(uuid)
	for (const child of node.tree) {
		await collectLevelUuids(sourceQuery, { node: child, levels, leftOut })
	}
}

/**
 * The applications and the functions a level of the unit holds (when it is the unit's: `holdsUnitPrimaries`), then
 * those of the levels below it made from a level of the unit.
 */
async function collectUnitPrimaries(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: {
		level: AnyTreeRecord
		holdsUnitPrimaries: boolean
		levelUuids: ReadonlySet<string>
		matchKey: FindDroppedPrimariesParams['matchKey']
		primaries: UnitPrimaries
	},
): Promise<void> {
	const { level, holdsUnitPrimaries, levelUuids, matchKey, primaries } = params
	for (const child of level.tree) {
		// the tree a reader gives sees through the level's Private: an application is a child of the level
		if (holdsUnitPrimaries && child.tagName === 'Function') primaries.functions.push(child)
		if (holdsUnitPrimaries && child.tagName === 'Application') primaries.applications.push(child)
		if (!isTopologyLevel(child.tagName)) continue
		const lineage = await reader.any.getAttribute(child, { name: matchKey })
		if (!lineage || !levelUuids.has(lineage)) continue
		await collectUnitPrimaries(reader, {
			level: child,
			holdsUnitPrimaries: true,
			levelUuids,
			matchKey,
			primaries,
		})
	}
}

/** The primaries of the project the source no longer holds, classified. */
async function classifyPrimaries(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: {
		primaries: readonly AnyTrackedRecord[]
		sourcePrimaryUuids: ReadonlySet<string>
		matchKey: FindDroppedPrimariesParams['matchKey']
		removalBase: FindDroppedPrimariesParams['removalBase']
	},
): Promise<DroppedElement[]> {
	const { primaries, sourcePrimaryUuids, matchKey, removalBase } = params
	const dropped: DroppedElement[] = []
	for (const primary of primaries) {
		const lineage = await reader.any.getAttribute(primary, { name: matchKey })
		if (!lineage) continue
		const change = classifyUnmatched({
			tagName: primary.tagName,
			lineage,
			inSource: sourcePrimaryUuids.has(lineage),
			removalBase,
		})
		if (change === 'still-held') continue
		if (await carriesOwnProvenance(reader, primary)) continue
		dropped.push({ element: primary, change })
	}
	return dropped
}
