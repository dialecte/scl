import { foldChanges } from './tuple-reference-changes'
import { UUID_REFERENCES_PERF_SPAN } from './uuid-references.constants'

import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { buildElementPaths } from '@/v2019C1/extensions/reference/query/build/build-element-path'
import { composeReferencePath } from '@/v2019C1/extensions/reference/query/build/compose-reference-path'
import { dataCompanionsOf } from '@/v2019C1/extensions/reference/query/build/data-companions'
import { localSegments } from '@/v2019C1/extensions/reference/query/build/local-segments'
import { toAnyRawRecord } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.helpers'
import { readAttribute } from '@/v2019C1/helpers'
import { exclusiveGroupsHeld, groupAttributeNames } from '@/v2019C1/hooks/shared/exclusive-groups'
import { findTargetsByUuid } from '@/v2019C1/hooks/shared/find-targets-by-uuid'
import { PATH_PAIRS_BY_TAG } from '@/v2019C1/hooks/shared/path-references.constants'
import {
	hasAttributeChange,
	updatedOperation,
	withAttributeValues,
} from '@/v2019C1/hooks/shared/record-ops'

import type { RecordChange } from './tuple-references.types'
import type {
	BoundPair,
	MovedElements,
	UnnamedPair,
	UuidReferenceRefusal,
} from './uuid-references.types'
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
 *   element is out of its reach (`out-of-scope`), the paths of those elements and of their behaviours read once; in its
 *   reach (written out of reach, then moved into it), its path is written from the element.
 * A behaviour variable a move carries (its local path is read from where it sits) gets its local path written again
 * when it changes. The paths written are the only operations the step stages.
 * Nothing is read when every written pair holds its path and no behaviour variable moved: the other pairs' paths are
 * the hooks' to write. A uuid naming
 * no element is left to the routes that write it. The mirror of `writePathReferencesAtCommit` (a path to its uuid):
 * this step reads a uuid to its path. Nothing outlives the call.
 */
export async function checkUuidReferencesAtCommit(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
	pending: ReadonlyMap<string, AnyRawRecord>
	/** The records the commit's earlier steps removed. */
	gone?: ReadonlySet<string>
	/** The elements of the subtrees the transaction moved, as the move step read them (`movedBy`, `read`). */
	moved?: MovedElements
}): Promise<Scl.Operation[]> {
	const { operations, query, pending, gone, moved } = params
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
	const carried = moved ? movedBehaviourPairsOf({ moved, pending, gone, written: pathless }) : []
	if (pathless.length === 0 && carried.length === 0) return []

	query.perf.start(UUID_REFERENCES_PERF_SPAN)
	try {
		const unnamed = await unnamedPairsOf({ query, pathless: [...pathless, ...carried] })
		if (unnamed.length > 0) return await localPathsWritten({ query, unnamed })
	} finally {
		query.perf.stop(UUID_REFERENCES_PERF_SPAN)
	}
	return []
}

/**
 * The behaviour variables of a moved subtree holding a uuid (their local path is read from where they sit, so a move
 * changes it), as the commit's earlier steps left them, the pairs already written left out.
 */
function movedBehaviourPairsOf(params: {
	moved: MovedElements
	pending: ReadonlyMap<string, AnyRawRecord>
	gone: ReadonlySet<string> | undefined
	written: readonly BoundPair[]
}): BoundPair[] {
	const { moved, pending, gone, written } = params
	const writtenIds = new Set(written.map((entry) => entry.record.id))
	return [...moved.ids].flatMap(function carriedPairs(id) {
		if (gone?.has(id) || writtenIds.has(id)) return []
		const record = pending.get(id) ?? moved.read.get(id)
		if (!record) return []
		return (PATH_PAIRS_BY_TAG.get(record.tagName) ?? []).flatMap(function carriedPair(pair) {
			if (pair.resolution !== RESOLUTION_TYPE.behaviorDescription) return []
			const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
			return uuid ? [{ record, pair, uuid }] : []
		})
	})
}

/** The pairs of a reference the transaction wrote (see {@link checkUuidReferencesAtCommit}), each holding its uuid. */
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

/** The behaviour variables to name (pathless, or carried by a move) whose uuid names an element: one lookup per target tag. */
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
 * The local path of each behaviour variable left without one, or carried by a move, whose uuid names an element:
 * refused when the element is out of its reach (not at or below the level above its BehaviorDescription); in reach, its
 * path composed from the element as the hooks compose it, over the attributes the commit leaves it, and written when it
 * differs from the one it holds. The paths of the elements and of the BehaviorDescriptions in one `buildElementPaths`.
 */
async function localPathsWritten(params: {
	query: Core.Query<Config>
	unnamed: readonly UnnamedPair[]
}): Promise<Scl.Operation[]> {
	const { query, unnamed } = params
	const paths = await buildElementPaths(query, {
		refs: unnamed.flatMap((entry) => [
			toRef(entry.target) as Scl.Ref<Scl.ElementsOf>,
			parentRefOf({ record: entry.record }),
		]),
	})
	const composed = unnamed.map(function composedPath(entry, index) {
		const targetPath = paths[index * 2]
		// the level above the BehaviorDescription: its path, the BehaviorDescription's own segment left out
		const behaviorContext = paths[index * 2 + 1]?.segments.slice(0, -1)
		const inReach =
			targetPath !== null &&
			behaviorContext !== undefined &&
			localSegments({ context: behaviorContext, segments: targetPath.segments }) !== null
		const path =
			inReach && targetPath
				? composeReferencePath({
						pair: entry.pair,
						referenceAttributes: entry.record.attributes,
						targetPath,
						behaviorContext,
					})
				: null
		return { entry, inReach, path }
	})
	const outOfReach = composed.find((candidate) => !candidate.inReach)
	if (outOfReach) {
		const { record, pair } = outOfReach.entry
		refuse({ refusal: { record, uuidAttribute: pair.attribute.uuid, reason: 'out-of-scope' } })
	}
	return composed.flatMap(function writtenPath({ entry, path }) {
		const record = entry.record as Scl.RawRecord<Scl.ElementsOf>
		if (!path) {
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `uuidReferences: no ${entry.pair.attribute.path} composes for the ${record.tagName} "${record.id}" naming an element in its reach`,
			})
		}
		if (readAttribute({ record, name: entry.pair.attribute.path, defaults: 'none' }) === path)
			return []
		return [
			updatedOperation(
				record,
				withAttributeValues(record.attributes, [{ name: entry.pair.attribute.path, value: path }]),
			),
		]
	})
}

/** The element holding a record (its BehaviorDescription, for a behaviour variable). */
function parentRefOf(params: { record: AnyRawRecord }): Scl.Ref<Scl.ElementsOf> {
	const { parent } = params.record
	if (!parent) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: `uuidReferences: the ${params.record.tagName} "${params.record.id}" has no parent`,
		})
	}
	return toRef(parent) as Scl.Ref<Scl.ElementsOf>
}

function refuse(params: { refusal: UuidReferenceRefusal }): never {
	const { record, uuidAttribute, reason } = params.refusal
	return throwDialecteError(SCL_ERRORS.REFERENCE_INCOHERENT, {
		meta: { reference: { tagName: record.tagName, id: record.id }, uuidAttribute, reason },
		detail: `the ${record.tagName} "${record.id}" (${uuidAttribute}): ${reason}`,
	})
}
