import { isInMovedSubtree } from './moved-roots'
import {
	PLACE_DEPENDENT_PAIRS_BY_TAG,
	PLACE_DEPENDENT_TARGET_TAGS,
	IED_TAG,
	PLACE_READING_REFERRERS,
	UNFOLLOWED_MOVE_TAGS,
	UUID_ATTRIBUTE,
} from './moves.constants'
import { terminalsLeftAcrossContainers } from './terminals-across-containers'
import { wrapMovedRoots } from './wrap-moved-roots'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { targetInScope } from '@/v2019C1/extensions/reference/query/resolve/target-in-scope'
import { readAttribute } from '@/v2019C1/helpers'
import {
	buildCascadeOperations,
	collectDeleteCascade,
	orphanEffectOf,
} from '@/v2019C1/hooks/before-delete'
import { followAncestry } from '@/v2019C1/hooks/shared/follow-ancestry'
import { changedAttributeNames, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'

import type { MovePlaces, MovedRef } from './moved-roots.types'
import type { MoveWrite, UnboundReferences } from './moves.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { OrphanedRef } from '@/v2019C1/hooks/before-delete'
import type { FollowedRoot } from '@/v2019C1/hooks/shared/follow-ancestry.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Refuse a commit moving a subtree that holds what a move does not follow yet (`UNFOLLOWED_MOVE_TAGS`: what tuple
 * references name or are, what sits only below a logical node): `SCL_ERRORS.MOVE_NOT_FOLLOWED`, for the moved element
 * holding the first one. Read from the document read once.
 */
export function assertMovesFollowed(places: MovePlaces): void {
	for (const record of places.document.records) {
		const move = places.movedBy.get(record.id)
		if (!move || !isUnfollowed({ places, record })) continue
		throwDialecteError(SCL_ERRORS.MOVE_NOT_FOLLOWED, {
			meta: { moved: move.ref, parent: move.to },
			detail: `${move.ref.tagName} "${move.ref.id}" moved under ${move.to.tagName} "${move.to.id}" holds ${record.tagName} "${record.id}", which references name by its place: a move does not follow it yet`,
		})
	}
}

/**
 * Whether a record is what a move does not follow when moved: a tag of `UNFOLLOWED_MOVE_TAGS`, or a tuple reference
 * reading its IED from its place (`PLACE_READING_REFERRERS`) whose source does not move with it.
 */
function isUnfollowed(params: { places: MovePlaces; record: AnyRawRecord }): boolean {
	const { places, record } = params
	if (UNFOLLOWED_MOVE_TAGS.has(record.tagName)) return true
	const role = PLACE_READING_REFERRERS.get(record.tagName)
	if (!role) return false
	const source =
		role === 'parent'
			? record.parent?.id
			: places.document.ancestryOf(record.id).findLast((above) => above.tagName === IED_TAG)?.id
	return source === undefined || !isInMovedSubtree({ places, id: source })
}

/**
 * What the moves of a commit change around them, all moves at once, from the document read once: an element of the
 * extension namespace moved under an element of the default one is wrapped as on create; the references whose path is
 * read from their own place and can no longer name their target are unbound as on a delete of that target (cleared
 * when they hold content of their own, else deleted); the terminals left naming a node their container may not name
 * are removed with what they hold; the paths of the moved subtrees and of what names them are rebuilt. One operation
 * per record, each written over what the commit's earlier steps wrote (`pending`).
 */
export async function followMovesAtCommit(
	query: Core.Query<Config>,
	params: {
		places: MovePlaces
		roots: readonly MovedRef[]
		pending: ReadonlyMap<string, AnyRawRecord>
	},
): Promise<Scl.Operation[]> {
	const { places, roots, pending } = params
	const wrapped = await wrapMovedRoots(query, { places, roots, pending })
	const unbound = referencesLeftOutOfScope(places)
	const removed = terminalsLeftAcrossContainers(places)
	const followed: FollowedRoot[] = []
	for (const root of roots) {
		// the one typed edge: the follower takes refs of the dialecte's elements
		followed.push({
			root: root as Scl.Ref<Scl.ElementsOf>,
			references: true,
			ownPath: true,
			below: true,
		})
	}
	const follows = await followAncestry(query, {
		roots: followed,
		read: { document: places.document, childrenOf: places.childrenOf },
	})
	const written = writtenOver({
		pending,
		writes: [...wrapped.writes, ...writesOf({ operations: follows })],
	})
	// a wrapper the moves need is created as on create
	const merged = new Map<string, AnyRawRecord>(pending)
	for (const record of wrapped.created) merged.set(record.id, record)
	for (const [id, write] of written) merged.set(id, write.newRecord)
	const cascade = await unbindAndRemove(query, {
		unbound: { cleared: unbound.cleared, deleted: [...unbound.deleted, ...removed] },
		pending: merged,
	})
	return [
		...createdOperations({ records: wrapped.created }),
		...cascade,
		...updatedOperations({ written, cascade }),
	]
}

/** The writes of the updates among some operations. */
function writesOf(params: { operations: readonly Scl.Operation[] }): MoveWrite[] {
	const writes: MoveWrite[] = []
	for (const operation of params.operations) {
		if (operation.status !== 'updated') continue
		writes.push({
			oldRecord: operation.oldRecord as AnyRawRecord,
			newRecord: operation.newRecord as AnyRawRecord,
		})
	}
	return writes
}

/** The operations creating the records. */
function createdOperations(params: { records: readonly AnyRawRecord[] }): Scl.Operation[] {
	const operations: Scl.Operation[] = []
	for (const record of params.records) {
		operations.push({
			status: 'created',
			oldRecord: undefined,
			newRecord: record as Scl.RawRecord<Scl.ElementsOf>,
		})
	}
	return operations
}

/** One update per record written, but those the cascade writes or deletes already. */
function updatedOperations(params: {
	written: ReadonlyMap<string, MoveWrite>
	cascade: readonly Scl.Operation[]
}): Scl.Operation[] {
	const touched = new Set<string>()
	for (const operation of params.cascade) touched.add(operationId(operation))
	const operations: Scl.Operation[] = []
	for (const [id, write] of params.written) {
		if (touched.has(id)) continue
		operations.push({
			status: 'updated',
			oldRecord: write.oldRecord as Scl.RawRecord<Scl.ElementsOf>,
			newRecord: write.newRecord as Scl.RawRecord<Scl.ElementsOf>,
		})
	}
	return operations
}

/**
 * The references whose path is read from their own place (`PLACE_DEPENDENT_PAIRS_BY_TAG`), the referrer or its target
 * moved, that the target's new place puts out of reach ({@link targetInScope}): the uuid, path and companions of each
 * such pair cleared when the reference holds content of its own (`orphanEffectOf`), else the reference deleted.
 */
function referencesLeftOutOfScope(places: MovePlaces): UnboundReferences {
	const { document } = places
	const targetsByUuid = new Map<string, AnyRawRecord[]>()
	for (const record of document.records) {
		if (!PLACE_DEPENDENT_TARGET_TAGS.has(record.tagName)) continue
		const uuid = readAttribute({ record, name: UUID_ATTRIBUTE, defaults: 'none' })
		if (uuid) targetsByUuid.set(uuid, [...(targetsByUuid.get(uuid) ?? []), record])
	}
	const cleared: UnboundReferences['cleared'][number][] = []
	const deleted: AnyRawRecord[] = []
	for (const record of document.records) {
		const attributes = outOfScopeAttributes({ places, record, targetsByUuid })
		if (attributes.size === 0) continue
		if (orphanEffectOf({ tagName: record.tagName }) === 'deleted') deleted.push(record)
		else cleared.push({ record, attributes })
	}
	return { cleared, deleted }
}

/** The uuid, path and companion attributes of each pair of a reference whose target the moves put out of its reach. */
function outOfScopeAttributes(params: {
	places: MovePlaces
	record: AnyRawRecord
	targetsByUuid: ReadonlyMap<string, readonly AnyRawRecord[]>
}): Set<string> {
	const { places, record, targetsByUuid } = params
	const attributes = new Set<string>()
	for (const pair of PLACE_DEPENDENT_PAIRS_BY_TAG.get(record.tagName) ?? []) {
		const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
		const target = (uuid ? (targetsByUuid.get(uuid) ?? []) : []).find((candidate) =>
			(pair.target as readonly string[]).includes(candidate.tagName),
		)
		if (!target) continue
		if (
			!isInMovedSubtree({ places, id: record.id }) &&
			!isInMovedSubtree({ places, id: target.id })
		)
			continue
		const reachable = targetInScope({
			pair,
			referrerAncestry: places.document.ancestryOf(record.id),
			target,
			targetAncestry: places.document.ancestryOf(target.id),
		})
		if (reachable) continue
		for (const name of [
			pair.attribute.uuid,
			pair.attribute.path,
			...pair.companions.map((companion) => companion.name),
		])
			attributes.add(name)
	}
	return attributes
}

/** The delete cascade of the references and terminals removed, with the references cleared, over what is written. */
async function unbindAndRemove(
	query: Core.Query<Config>,
	params: {
		unbound: UnboundReferences
		pending: ReadonlyMap<string, AnyRawRecord>
	},
): Promise<Scl.Operation[]> {
	const { unbound } = params
	if (unbound.cleared.length === 0 && unbound.deleted.length === 0) return []
	// the typed edge: the delete cascade takes the dialecte's records
	const roots = unbound.deleted as Scl.TrackedRecord<Scl.ElementsOf>[]
	const pending = params.pending as ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	const cascade =
		roots.length > 0
			? await collectDeleteCascade(query, { roots, emptiesContainers: true })
			: { gone: new Set<string>(), deleted: [], within: [], cleared: [] }
	const cleared: OrphanedRef[] = [...cascade.cleared]
	for (const { record, attributes } of unbound.cleared) {
		if (cascade.gone.has(record.id)) continue
		cleared.push({
			record: record as Scl.TrackedRecord<Scl.ElementsOf>,
			effect: 'cleared',
			attributes,
		})
	}
	return buildCascadeOperations(query, {
		cascade: { ...cascade, cleared },
		deletedRoots: roots,
		pending,
	})
}

/**
 * One write per record, each applied over the record as the commit's earlier steps left it: the attributes a write
 * changes, and its parent and children when it changes them.
 */
function writtenOver(params: {
	pending: ReadonlyMap<string, AnyRawRecord>
	writes: readonly MoveWrite[]
}): Map<string, MoveWrite> {
	const written = new Map<string, MoveWrite>()
	for (const { oldRecord, newRecord } of params.writes) {
		const known = written.get(newRecord.id)
		const held = known?.newRecord ?? params.pending.get(newRecord.id)
		if (!held) {
			written.set(newRecord.id, { oldRecord: known?.oldRecord ?? oldRecord, newRecord })
			continue
		}
		written.set(newRecord.id, {
			oldRecord: known?.oldRecord ?? oldRecord,
			newRecord: appliedOver({ held, oldRecord, newRecord }),
		})
	}
	return written
}

/** A write applied over a record: the attributes it changes, its parent and children when it changes them. */
function appliedOver(params: {
	held: AnyRawRecord
	oldRecord: AnyRawRecord
	newRecord: AnyRawRecord
}): AnyRawRecord {
	const { held, oldRecord, newRecord } = params
	const names = changedAttributeNames({
		oldRecord: oldRecord as Scl.RawRecord<Scl.ElementsOf>,
		newRecord: newRecord as Scl.RawRecord<Scl.ElementsOf>,
	})
	const values: { name: string; value: string | undefined }[] = []
	for (const name of names) {
		values.push({
			name,
			value: readAttribute({ record: newRecord, name, defaults: 'none', fullObject: true })?.value,
		})
	}
	return {
		...held,
		parent: oldRecord.parent?.id === newRecord.parent?.id ? held.parent : newRecord.parent,
		children: sameChildren({ left: oldRecord.children, right: newRecord.children })
			? held.children
			: newRecord.children,
		attributes: withAttributeValues(held.attributes, values) as AnyRawRecord['attributes'],
	}
}

function sameChildren(params: {
	left: readonly { id: string }[]
	right: readonly { id: string }[]
}): boolean {
	const { left, right } = params
	return left.length === right.length && left.every((child, index) => child.id === right[index]?.id)
}

function operationId(operation: Scl.Operation): string {
	return operation.status === 'deleted' ? operation.oldRecord.id : operation.newRecord.id
}
