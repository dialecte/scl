import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { isTopologyLevel, readAttribute } from '@/v2019C1/helpers'

import type {
	ComposePrimaryParentsParams,
	FindPrimaryMovesParams,
	PrimaryMove,
	PrimaryParents,
	PrimaryPlace,
	ReadTemplatePrimariesParams,
	ResolvePrimaryParentsOfEachParams,
	ResolvePrimaryParentsParams,
	TemplatePrimary,
} from './resolve-primary-parents.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

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
 *
 * One primary: an update resolving several reads them once with {@link readTemplatePrimaries} and resolves them
 * together with {@link resolvePrimaryParentsOfEach}.
 */
export async function resolvePrimaryParents(
	query: Core.Query<Config>,
	params: ResolvePrimaryParentsParams,
): Promise<PrimaryParents> {
	const { sourceQuery, primaryRef, ...rest } = params
	const primaries = await readTemplatePrimaries(sourceQuery, { refs: [primaryRef] })
	const [parents] = await resolvePrimaryParentsOfEach(query, {
		...rest,
		primaries,
		withMoves: true,
	})
	// one primary in, one answer out
	if (!parents) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: `${primaryRef.tagName} "${primaryRef.id}" was resolved to nothing`,
		})
	}
	return parents
}

/** The primaries as the template holds them, read in one batch: their records (for their uuid) and their ancestors. */
export async function readTemplatePrimaries(
	query: Core.Query<Config>,
	params: ReadTemplatePrimariesParams,
): Promise<TemplatePrimary[]> {
	const { refs } = params
	if (refs.length === 0) return []
	const records = await query.getRecords([...refs])
	const ancestries = await query.findAncestorsOfEach(refs, { stopAtTagName: 'Substation' })
	return refs.map(function templatePrimaryOf(ref, position): TemplatePrimary {
		const record = records[position]
		return {
			ref,
			uuid: record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : undefined,
			ancestors: ancestries[position] ?? [],
		}
	})
}

/**
 * {@link resolvePrimaryParents} for every primary of a pass at once, in the order given: the project's records of each
 * primary tag read once and matched by lineage, and, with `withMoves`, the ancestors of every held instance read in
 * one call. What the project holds is read at the call: a pass after a write calls it again.
 */
export async function resolvePrimaryParentsOfEach(
	query: Core.Query<Config>,
	params: ResolvePrimaryParentsOfEachParams,
): Promise<PrimaryParents[]> {
	const { primaries, matchKey, withMoves } = params
	// the two primary tags, each read once when a primary of it is resolved
	const heldApplications = primaries.some((primary) => primary.ref.tagName === 'Application')
		? await query.any.getRecordsByTagName('Application')
		: []
	const heldFunctions = primaries.some((primary) => primary.ref.tagName === 'Function')
		? await query.any.getRecordsByTagName('Function')
		: []
	const byTag = new Map<Scl.ElementsOf, readonly AnyTrackedRecord[]>([
		['Application', heldApplications],
		['Function', heldFunctions],
	])
	const targetIds =
		params.primaryTargets && new Set(params.primaryTargets.map((target) => target.id))
	// lineage only: a primary carries a uuid, a same-name element of no lineage is never its instance
	const heldOfEach = primaries.map(function heldOf(primary): AnyTrackedRecord[] {
		if (!primary.uuid) return []
		return (byTag.get(primary.ref.tagName) ?? []).filter(
			(record) =>
				readAttribute({ record, name: matchKey, defaults: 'none' }) === primary.uuid &&
				(!targetIds || targetIds.has(record.id)),
		)
	})
	// the held records as they are: no read to resolve them
	const everyHeld = withMoves ? heldOfEach.flat() : []
	const ancestries =
		everyHeld.length > 0
			? await query.findAncestorsOfEach(everyHeld as readonly Scl.Ref<Scl.ElementsOf>[], {
					stopAtTagName: 'Substation',
				})
			: []
	let offset = 0
	return primaries.map(function parentsOf(primary, position): PrimaryParents {
		const held = heldOfEach[position] ?? []
		const heldAncestries = withMoves ? ancestries.slice(offset, offset + held.length) : []
		if (withMoves) offset += held.length
		return composePrimaryParents({ params, primary, held, ancestries: heldAncestries })
	})
}

/** Where one primary goes, from what was read of it: pure. */
function composePrimaryParents(input: ComposePrimaryParentsParams): PrimaryParents {
	const { params, primary, held, ancestries } = input
	const { anchor, unitId, instanceLevelsList, withMoves } = params
	const sourceAncestors = primary.ancestors
	if (held.length > 0) {
		const moves = withMoves
			? findPrimaryMoves({ held, ancestries, sourceAncestors, unitId, instanceLevelsList })
			: []
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
 * revision moved). Pure: the ancestors of the held instances are read by the caller, in one call.
 */
function findPrimaryMoves(params: FindPrimaryMovesParams): PrimaryMove[] {
	const { held, ancestries, sourceAncestors, unitId, instanceLevelsList } = params
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
