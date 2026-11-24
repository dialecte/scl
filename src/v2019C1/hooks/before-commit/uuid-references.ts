import { foldChanges } from './tuple-reference-changes'
import { UUID_REFERENCES_PERF_SPAN } from './uuid-references.constants'

import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { dataCompanionsOf } from '@/v2019C1/extensions/reference/query/build/data-companions'
import { toAnyRawRecord } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.helpers'
import { targetInScope } from '@/v2019C1/extensions/reference/query/resolve/target-in-scope'
import { readAttribute } from '@/v2019C1/helpers'
import { exclusiveGroupsHeld, groupAttributeNames } from '@/v2019C1/hooks/shared/exclusive-groups'
import { findTargetsByUuid } from '@/v2019C1/hooks/shared/find-targets-by-uuid'
import { PATH_PAIRS_BY_TAG } from '@/v2019C1/hooks/shared/path-references.constants'
import { hasAttributeChange } from '@/v2019C1/hooks/shared/record-ops'

import type { RecordChange } from './tuple-references.types'
import type { BoundPair, UnnamedPair, UuidReferenceRefusal } from './uuid-references.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Refuse the commit (`REFERENCE_INCOHERENT`) when a uuid reference the transaction writes cannot be named coherently.
 * A pair is written when the transaction creates its referrer holding its uuid, gives it a uuid, or changes one of its
 * data names while it holds one; rewriting its path alone (a rename, a move, an orphan cleared) writes nothing, and a
 * referrer an earlier step of the commit removed (`gone`) is not checked. Reference by reference in the transaction's
 * order, nothing read for the first two:
 * - a behaviour variable given an attribute of one of its groups while it holds both (`groups-together`);
 * - a pair holding its uuid without the data object the registry requires beside it (`data-missing`);
 * - a behaviour variable left without its path whose uuid names an element (one lookup per target tag): refused when the
 *   element is out of its reach (`out-of-scope`), the ancestors of those variables and elements read once; in its
 *   reach its path is always written, so an empty one is a hook that missed it (`ASSERTION_FAILED`).
 * Nothing is read when every written pair holds its path: the other pairs' paths are the hooks' to write. A uuid naming
 * no element is left to the routes that write it. The mirror of `writePathReferencesAtCommit` (a path to its uuid):
 * this step reads a uuid to its path and stages nothing. Nothing outlives the call.
 */
export async function assertUuidReferencesAtCommit(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
	pending: ReadonlyMap<string, AnyRawRecord>
	/** The records the commit's earlier steps removed. */
	gone?: ReadonlySet<string>
}): Promise<void> {
	const { operations, query, pending, gone } = params
	const changes = [...foldChanges({ operations, pending }).values()].filter(
		(change) => !gone?.has(change.after.id),
	)
	const boundByChange = changes.map((change) => boundPairsOf({ change }))
	// the first reference the transaction wrote that holds a problem, its groups first, then its data
	const [first] = changes.flatMap(function refusalsOf(change, index) {
		return [
			...groupsTogetherOf({ change }),
			...boundByChange[index].flatMap((bound) => dataMissingOf({ bound })),
		]
	})
	if (first) refuse({ refusal: first })
	const pathless = boundByChange.flat().filter(isPathlessBehaviourPair)
	if (pathless.length === 0) return

	query.perf.start(UUID_REFERENCES_PERF_SPAN)
	try {
		const unnamed = await unnamedPairsOf({ query, pathless })
		if (unnamed.length > 0) await assertInReach({ query, unnamed })
	} finally {
		query.perf.stop(UUID_REFERENCES_PERF_SPAN)
	}
}

/** The pairs of a reference the transaction wrote (see {@link assertUuidReferencesAtCommit}), each holding its uuid. */
function boundPairsOf(params: { change: RecordChange }): BoundPair[] {
	const { change } = params
	const { before, after } = change
	return (PATH_PAIRS_BY_TAG.get(after.tagName) ?? []).flatMap(function boundPair(pair) {
		const uuid = readAttribute({ record: after, name: pair.attribute.uuid, defaults: 'none' })
		if (!uuid) return []
		const written =
			!before ||
			hasAttributeChange({
				oldRecord: before as Scl.RawRecord<Scl.ElementsOf>,
				newRecord: after as Scl.RawRecord<Scl.ElementsOf>,
				names: [pair.attribute.uuid, ...pair.companions.map((companion) => companion.name)],
			})
		return written ? [{ record: after, pair, uuid }] : []
	})
}

/**
 * A behaviour variable the transaction created, or gave an attribute of one of its groups, holding both groups: named
 * by the uuid attribute of the last group in the registry's order it set.
 */
function groupsTogetherOf(params: { change: RecordChange }): UuidReferenceRefusal[] {
	const { change } = params
	const { before, after } = change
	const pairs = PATH_PAIRS_BY_TAG.get(after.tagName) ?? []
	if (!exclusiveGroupsHeld({ record: after, pairs })) return []
	const set = pairs.filter(function setByTransaction(pair) {
		return groupAttributeNames({ pair }).some(
			(name) =>
				readAttribute({ record: after, name, defaults: 'none' }) &&
				(!before || !readAttribute({ record: before, name, defaults: 'none' })),
		)
	})
	const last = set.at(-1)
	if (!last) return []
	return [{ record: after, uuidAttribute: last.attribute.uuid, reason: 'groups-together' }]
}

/** A written pair holding its uuid without the data object the registry requires beside it. */
function dataMissingOf(params: { bound: BoundPair }): UuidReferenceRefusal[] {
	const { record, pair } = params.bound
	const { doAttribute, doRequired } = dataCompanionsOf(pair)
	if (!doRequired || !doAttribute) return []
	if (readAttribute({ record, name: doAttribute, defaults: 'none' })) return []
	return [{ record, uuidAttribute: pair.attribute.uuid, reason: 'data-missing' }]
}

/** Whether a written pair is a behaviour variable's, left without its path. */
function isPathlessBehaviourPair(bound: BoundPair): boolean {
	return (
		bound.pair.resolution === RESOLUTION_TYPE.behaviorDescription &&
		!readAttribute({ record: bound.record, name: bound.pair.attribute.path, defaults: 'none' })
	)
}

/** The pathless behaviour variables whose uuid names an element: one lookup per target tag. */
async function unnamedPairsOf(params: {
	query: Core.Query<Config>
	pathless: readonly BoundPair[]
}): Promise<UnnamedPair[]> {
	const { query, pathless } = params
	const targets = await findTargetsByUuid(query, {
		sought: pathless.map((entry) => ({ uuid: entry.uuid, targetTagNames: entry.pair.target })),
	})
	return pathless.flatMap(function unnamedPair(entry, index) {
		const target = targets[index]
		return target ? [{ ...entry, target: toAnyRawRecord(target) }] : []
	})
}

/**
 * Each behaviour variable left without a path although its uuid names an element: refused when the element is out of
 * its reach, an assertion otherwise. The ancestors of the variables and their elements in one read per level.
 */
async function assertInReach(params: {
	query: Core.Query<Config>
	unnamed: readonly UnnamedPair[]
}): Promise<void> {
	const { query, unnamed } = params
	const ancestries = await query.findAncestorsOfEach(
		unnamed.flatMap((entry) => [
			toRef(entry.record),
			toRef(entry.target),
		]) as Scl.Ref<Scl.ElementsOf>[],
		{ order: 'top-down' },
	)
	for (const [index, entry] of unnamed.entries()) {
		const reachable = targetInScope({
			pair: entry.pair,
			referrerAncestry: (ancestries[index * 2] ?? []).map(toAnyRawRecord),
			target: entry.target,
			targetAncestry: (ancestries[index * 2 + 1] ?? []).map(toAnyRawRecord),
		})
		if (!reachable) {
			refuse({
				refusal: {
					record: entry.record,
					uuidAttribute: entry.pair.attribute.uuid,
					reason: 'out-of-scope',
				},
			})
		}
		throwDialecteError('ASSERTION_FAILED', {
			detail: `uuidReferences: the ${entry.record.tagName} "${entry.record.id}" holds a ${entry.pair.attribute.uuid} naming an element in its reach and no ${entry.pair.attribute.path}`,
		})
	}
}

function refuse(params: { refusal: UuidReferenceRefusal }): never {
	const { record, uuidAttribute, reason } = params.refusal
	return throwDialecteError(SCL_ERRORS.REFERENCE_INCOHERENT, {
		meta: { reference: { tagName: record.tagName, id: record.id }, uuidAttribute, reason },
		detail: `the ${record.tagName} "${record.id}" (${uuidAttribute}): ${reason}`,
	})
}
