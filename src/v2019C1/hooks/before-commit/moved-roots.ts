import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'
import { childrenIndexOf } from '@/v2019C1/hooks/shared/follow-ancestry'

import type { MovePlaces, MovedRecord, MovedRef } from './moved-roots.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The elements the transaction left under another parent than their first one, read from its raw operations: the first
 * parent is the one its first operation gives it before (a record created in the transaction: the one it was created
 * under), the last one the parent its last operation leaves. A move undone (A to B to A) is none; a record deleted at
 * the end is none; nor is an element placed in a transparent wrapper of the parent it had (the wrap of an element of
 * the extension namespace on create): its place is the same.
 */
export function movedRecordsOf(params: {
	operations: ReadonlyArray<Scl.Operation>
}): Map<string, MovedRecord> {
	const first = new Map<string, MovedRef | undefined>()
	const last = new Map<string, AnyRawRecord>()
	for (const operation of params.operations) {
		if (operation.status === 'deleted') {
			first.delete(operation.oldRecord.id)
			last.delete(operation.oldRecord.id)
			continue
		}
		const { id } = operation.newRecord
		if (!first.has(id)) {
			const before = operation.status === 'created' ? operation.newRecord : operation.oldRecord
			first.set(id, before.parent ? refOf(before.parent) : undefined)
		}
		last.set(id, operation.newRecord as AnyRawRecord)
	}
	const moved = new Map<string, MovedRecord>()
	for (const [id, record] of last) {
		const from = first.get(id)
		if (!from || !record.parent || record.parent.id === from.id) continue
		const wrappedInPlace =
			isTransparentElement(record.parent.tagName) &&
			last.get(record.parent.id)?.parent?.id === from.id
		if (!wrappedInPlace) moved.set(id, { ref: refOf(record), from, to: refOf(record.parent) })
	}
	return moved
}

/** The document read once, indexed by id, with the subtree of every move: what the commit's move steps read from. */
export function movePlacesOf(params: {
	moved: ReadonlyMap<string, MovedRecord>
	document: MovePlaces['document']
	operations: ReadonlyArray<Scl.Operation>
}): MovePlaces {
	const { moved, document, operations } = params
	const read = new Map<string, AnyRawRecord>()
	for (const record of document.records) read.set(record.id, record)
	const childrenOf = childrenIndexOf({ document })
	return {
		moved,
		document,
		read,
		childrenOf,
		written: writtenRecordsOf({ operations }),
		movedBy: movedSubtrees({ moved, document, read, childrenOf }),
	}
}

/**
 * The record each operation leaves, by id, the last one winning; a deleted one as it was last held (a moved element's
 * old parent the transaction deleted still tells where it was).
 */
function writtenRecordsOf(params: {
	operations: ReadonlyArray<Scl.Operation>
}): Map<string, AnyRawRecord> {
	const written = new Map<string, AnyRawRecord>()
	for (const operation of params.operations) {
		const record = operation.status === 'deleted' ? operation.oldRecord : operation.newRecord
		written.set(record.id, record as AnyRawRecord)
	}
	return written
}

/**
 * Each element of a moved subtree, by id, with the nearest move holding it: read down once from every moved element,
 * the deepest moves first, through the read's children index (a moved `Private` included).
 */
function movedSubtrees(params: {
	moved: ReadonlyMap<string, MovedRecord>
	document: MovePlaces['document']
	read: ReadonlyMap<string, AnyRawRecord>
	childrenOf: ReadonlyMap<string, readonly AnyRawRecord[]>
}): Map<string, MovedRecord> {
	const { moved, document, read, childrenOf } = params
	function depthOf(id: string): number {
		return read.has(id) ? document.ancestryOf(id).length : 0
	}
	const deepestFirst = [...moved.values()].sort(
		(left, right) => depthOf(right.ref.id) - depthOf(left.ref.id),
	)
	const movedBy = new Map<string, MovedRecord>()
	for (const move of deepestFirst) {
		const ids = [move.ref.id]
		for (let index = 0; index < ids.length; index++) {
			const id = ids[index]
			if (movedBy.has(id) && index > 0) continue
			if (!movedBy.has(id)) movedBy.set(id, move)
			for (const child of childrenOf.get(id) ?? []) ids.push(child.id)
		}
	}
	return movedBy
}

/**
 * The moved elements no other moved element holds, from where they end: the roots whose subtrees the commit follows.
 * A moved wrapper the document read goes through (a `Private`) is followed by the elements it holds.
 */
export function topmostMovedRoots(places: MovePlaces): MovedRef[] {
	const { moved, document, read } = places
	const roots: MovedRef[] = []
	for (const record of document.records) {
		const parentId = record.parent?.id
		const movedHere =
			moved.has(record.id) || (parentId !== undefined && moved.has(parentId) && !read.has(parentId))
		if (!movedHere) continue
		const below = document.ancestryOf(record.id).some((ancestor) => moved.has(ancestor.id))
		if (!below) roots.push(refOf(record))
	}
	return roots
}

/** The records from the document root down to an element, the element last, as the commit leaves them. */
export function chainOf(params: { places: MovePlaces; id: string }): readonly AnyRawRecord[] {
	const { places, id } = params
	const { document, read, written } = places
	const held = read.get(id) ?? written.get(id)
	if (!held) return []
	const above = document.ancestryOf(id)
	if (above.length > 0 || !held.parent) return [...above, held]
	return [...chainOf({ places, id: held.parent.id }), held]
}

/** Whether the transaction moved an element or an element above it (a moved wrapper it sits in included). */
export function isInMovedSubtree(params: { places: MovePlaces; id: string }): boolean {
	return params.places.movedBy.has(params.id)
}

function refOf(record: { tagName: string; id: string }): MovedRef {
	return { tagName: record.tagName, id: record.id }
}

/** The places of the elements the transaction moved, the document read once for them; none without a move. */
export async function readMovePlaces(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<MovePlaces | undefined> {
	const { operations, query } = params
	const moved = movedRecordsOf({ operations })
	if (moved.size === 0) return undefined
	const document = await collectWithAncestry(query, {})
	return movePlacesOf({ moved, document, operations })
}
