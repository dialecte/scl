import { toRef } from '@dialecte/core/helpers'

import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type {
	FindPrimaryMovesParams,
	PrimaryMove,
	PrimaryParents,
	PrimaryPlace,
	ResolvePrimaryParentsParams,
} from './resolve-primary-parents.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Where a primary of the scope is updated, and whether the template gained it (no instance of it
 * yet).
 *
 * A primary the project already holds an instance of (among the instances the operation is scoped to, when it is) is
 * reconciled where its instances are: under the element the consumer started from. A primary the template GAINED has none: it is placed once
 * per instance of the unit — for that instance (`placedFor`, the level it sits on), on the level the
 * instance holds for the level the primary sits on in the template, in the bay the instance lives
 * in, not under the element the update was started from. With no instance of the unit to tell, it
 * falls back on that element.
 */
export async function resolvePrimaryParents(
	query: Core.Query<Config>,
	params: ResolvePrimaryParentsParams,
): Promise<PrimaryParents> {
	const { sourceQuery, primaryRef, anchor, unitId, instanceLevelsList, matchKey } = params

	const sourceUuid = await sourceQuery.any.getAttribute(primaryRef, { name: 'uuid' })
	const everyHeld = await findInstancesByTemplateUuid(query, {
		tagName: primaryRef.tagName,
		sourceUuid,
		matchKey,
	})
	const targetIds =
		params.primaryTargets && new Set(params.primaryTargets.map((target) => target.id))
	const held = targetIds ? everyHeld.filter((instance) => targetIds.has(instance.id)) : everyHeld
	const sourceAncestors = await sourceQuery.findAncestors(primaryRef, {
		stopAtTagName: 'Substation',
	})
	if (held.length > 0) {
		const moves = await findPrimaryMoves(query, {
			held,
			sourceAncestors,
			unitId,
			instanceLevelsList,
		})
		return { places: [{ parent: anchor }], gained: false, moves }
	}

	const places: PrimaryPlace[] = []
	for (const instanceLevels of instanceLevelsList) {
		const placedFor = instanceLevels.get(unitId)
		if (!placedFor) continue
		// one instance named: placed there only
		if (params.gainedIn && placedFor.id !== params.gainedIn.id) continue
		const sourceLevel = sourceAncestors.find((ancestor) => instanceLevels.has(ancestor.id))
		const parent = sourceLevel && instanceLevels.get(sourceLevel.id)
		places.push({ placedFor, ...(parent ? { parent } : {}) })
	}
	// with one instance named, never on the element the consumer started from
	if (params.gainedIn) return { places, gained: true, moves: [] }
	return { places: places.length > 0 ? places : [{ parent: anchor }], gained: true, moves: [] }
}

/**
 * The held instances of a primary the revision puts on another level of their instance of the unit: the level the
 * instance holds for the template level the primary sits on, when it is not the level the instance is held on (a level
 * the revision removes included). Not moved: an instance held in no instance of the unit (the project placed it outside
 * the unit), and the instances of an instance of the unit holding the primary twice (nothing tells which one the
 * revision moved). The
 * ancestors of every held instance are read in one call.
 */
async function findPrimaryMoves(
	query: Core.Query<Config>,
	params: FindPrimaryMovesParams,
): Promise<PrimaryMove[]> {
	const { held, sourceAncestors, unitId, instanceLevelsList } = params
	// the held records as they are: no read to resolve them
	const ancestries = await query.findAncestorsOfEach(held as readonly Scl.Ref<Scl.ElementsOf>[], {
		stopAtTagName: 'Substation',
	})
	const candidates = held.flatMap(function candidateOf(instance, position): PrimaryMove[] {
		const ancestry = ancestries[position] ?? []
		const heldLevel = ancestry.find((ancestor) => isTopologyLevel(ancestor.tagName))
		const ids = new Set(ancestry.map((ancestor) => ancestor.id))
		const instanceLevels = instanceLevelsList.find((levels) => {
			const placedFor = levels.get(unitId)
			return placedFor?.id !== undefined && ids.has(placedFor.id)
		})
		const placedFor = instanceLevels?.get(unitId)
		if (!heldLevel || !instanceLevels || !placedFor) return []
		const sourceLevel = sourceAncestors.find((ancestor) => instanceLevels.has(ancestor.id))
		if (!sourceLevel) return []
		const to = instanceLevels.get(sourceLevel.id)
		if (to?.id === heldLevel.id) return []
		return [
			{
				instance: toRef(instance) as PrimaryMove['instance'],
				from: toRef(heldLevel) as Scl.Ref<Scl.ElementsOf>,
				...(to ? { to } : {}),
				toSource: toRef(sourceLevel) as Scl.Ref<Scl.ElementsOf>,
				placedFor,
				fromChain: ancestry.map((ancestor) => ancestor.id),
			},
		]
	})
	// an instance of the unit holding the primary twice moves neither
	const heldPerInstance = new Map<string, number>()
	for (const [position] of held.entries()) {
		const ids = new Set((ancestries[position] ?? []).map((ancestor) => ancestor.id))
		for (const levels of instanceLevelsList) {
			const placedFor = levels.get(unitId)
			if (placedFor?.id && ids.has(placedFor.id))
				heldPerInstance.set(placedFor.id, (heldPerInstance.get(placedFor.id) ?? 0) + 1)
		}
	}
	return candidates.filter((move) => (heldPerInstance.get(move.placedFor.id ?? '') ?? 0) <= 1)
}
