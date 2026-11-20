import {
	ACCESS_POINT_TAG,
	ADDRESS_TAGS_BY_CONTROL_BLOCK,
	CONNECTED_ACCESS_POINT_TAG,
	FOLLOWED_WITHIN_IED_TAGS,
	IED_TAG,
	LOG_CONTROL_TAG,
	LOG_DEVICE_ATTRIBUTE,
	UUID_ATTRIBUTE,
} from './moves.constants'

import { toRef } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { TUPLE_TARGET_KINDS } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { ownIedName } from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import { targetTupleParts } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { readAttribute } from '@/v2019C1/helpers'
import { namedTargetUuids, partsOf, tupleNamesUpdate } from '@/v2019C1/hooks/shared'
import { withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'

import type { MovePlaces } from './moved-roots.types'
import type {
	CarriedAddress,
	MoveJudgedParams,
	MovedTargetNamesParams,
	UnconnectedAddress,
} from './moved-within-an-ied.types'
import type { MoveWrite } from './moves.types'
import type { Scl } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Whether a move is one the commit follows within an IED: its root is a logical node or a logical device
 * (`FOLLOWED_WITHIN_IED_TAGS`, read from the tuple registry) and the IED above its old parent is the IED above its new
 * one. Its subtree then moves with every tuple reference naming it following; any other move keeps the move step's
 * refusal of what a move does not follow.
 */
export function isMovedWithinItsIed(params: MoveJudgedParams): boolean {
	const { places, move } = params
	if (!FOLLOWED_WITHIN_IED_TAGS.has(move.ref.tagName)) return false
	const from = iedAt({ places, id: move.from.id })
	return from !== undefined && from === iedAt({ places, id: move.to.id })
}

/**
 * The first address (`GSE` / `SMV`) of a control block of a logical device moved to another access point of its IED that
 * has no connection to go to: the new access point holds no `ConnectedAP` on the subnetwork the address sits on. None
 * for a move that keeps the access point, or any other move.
 */
export function unconnectedAddressOf(params: MoveJudgedParams): UnconnectedAddress | undefined {
	const [first] = addressesCarriedBy(params).filter((carried) => carried.connection === undefined)
	return first ? { address: first.address, subNetwork: first.subNetwork } : undefined
}

/**
 * Each address (`GSE` / `SMV`) of a control block in a logical device moved to another access point of its IED, moved to
 * the new access point's `ConnectedAP` on the same subnetwork, its record and address kept: the address of a control
 * block on a subnetwork does not depend on the access point sending it. One write per address and per connection.
 */
export function carriedAddressWrites(params: { places: MovePlaces }): MoveWrite[] {
	const { places } = params
	const carried = [...places.moved.values()].flatMap((move) =>
		addressesCarriedBy({ places, move }).flatMap((address) =>
			address.connection ? [{ ...address, connection: address.connection }] : [],
		),
	)
	const childrenById = new Map<string, AnyRawRecord['children']>()
	const writes: MoveWrite[] = []
	for (const { address, from, connection } of carried) {
		writes.push({
			oldRecord: address,
			newRecord: { ...address, parent: toRef(connection) as AnyRawRecord['parent'] },
		})
		const left = childrenById.get(from.id) ?? from.children
		childrenById.set(
			from.id,
			left.filter((child) => child.id !== address.id),
		)
		const joined = childrenById.get(connection.id) ?? connection.children
		childrenById.set(connection.id, withChildInOrder({ children: joined, child: address }))
	}
	for (const [id, children] of childrenById) {
		const record = places.read.get(id)
		if (record) writes.push({ oldRecord: record, newRecord: { ...record, children } })
	}
	return writes
}

/**
 * Each log control without `ldInst` in a logical node moved to another logical device of its IED, given the `inst` of
 * the device it was in: it named the log of its own device, and keeps naming that log.
 */
export function logControlWrites(params: { places: MovePlaces }): MoveWrite[] {
	const { places } = params
	const writes: MoveWrite[] = []
	for (const record of places.document.records) {
		if (record.tagName !== LOG_CONTROL_TAG) continue
		if (readAttribute({ record, name: LOG_DEVICE_ATTRIBUTE, defaults: 'none' })) continue
		const move = places.movedBy.get(record.id)
		if (!move || move.ref.tagName === 'LDevice' || !isMovedWithinItsIed({ places, move })) continue
		const device = deviceAt({ places, id: move.from.id })
		const inst = device
			? readAttribute({ record: device, name: 'inst', defaults: 'none' })
			: undefined
		if (!inst) continue
		writes.push({
			oldRecord: record,
			newRecord: {
				...record,
				attributes: withAttributeValues(record.attributes, [
					{ name: LOG_DEVICE_ATTRIBUTE, value: inst },
				]) as AnyRawRecord['attributes'],
			},
		})
	}
	return writes
}

/**
 * The tuple references naming, by uuid, a tuple target in a subtree moved within its IED, each given the target's names
 * at its new place (an LNode as on a rebinding: the uuid wins), from the document the move step read once: nothing is
 * read. A reference the commit's earlier steps wrote is written over as they left it (`pending`).
 */
export function movedTargetNameOperations(params: MovedTargetNamesParams): Scl.Operation[] {
	const { places, pending } = params
	const partsByUuid = new Map<string, TupleTargetParts | undefined>()
	const targetTagByUuid = new Map<string, string>()
	for (const record of places.document.records) {
		if (!TUPLE_TARGET_KINDS.has(record.tagName)) continue
		const move = places.movedBy.get(record.id)
		if (!move || !isMovedWithinItsIed({ places, move })) continue
		const uuid = readAttribute({ record, name: UUID_ATTRIBUTE, defaults: 'none' })
		if (!uuid) continue
		partsByUuid.set(
			uuid,
			targetTupleParts({ record, ancestry: places.document.ancestryOf(record.id) }),
		)
		targetTagByUuid.set(uuid, record.tagName)
	}
	if (partsByUuid.size === 0) return []
	const pairsByTag = TUPLE_REFERENCE_PAIRS as Readonly<
		Record<string, readonly TupleReferencePair[]>
	>
	const operations: Scl.Operation[] = []
	for (const read of places.document.records) {
		const pairs = pairsByTag[read.tagName]
		if (!pairs) continue
		const record = pending.get(read.id) ?? read
		const uuids = namedTargetUuids({ record, pairs, targetTagByUuid })
		if (uuids.length === 0) continue
		const operation = tupleNamesUpdate({
			record,
			pairs,
			partsByUuid: partsOf({ uuids, partsByUuid }),
			ownIedName: ownIedName({ ancestry: places.document.ancestryOf(read.id) }),
		})
		if (operation) operations.push(operation)
	}
	return operations
}

/** The addresses of the control blocks a logical device moved to another access point of its IED sends, each with where it goes. */
function addressesCarriedBy(params: MoveJudgedParams): CarriedAddress[] {
	const { places, move } = params
	if (move.ref.tagName !== 'LDevice' || !isMovedWithinItsIed(params)) return []
	const oldAccessPoint = accessPointAt({ places, id: move.from.id })
	const newAccessPoint = accessPointAt({ places, id: move.to.id })
	if (!oldAccessPoint || !newAccessPoint || oldAccessPoint.id === newAccessPoint.id) return []
	const iedId = iedAt({ places, id: move.to.id })
	const ied = iedId ? places.read.get(iedId) : undefined
	const iedName = ied ? readAttribute({ record: ied, name: 'name', defaults: 'none' }) : undefined
	const oldName = readAttribute({ record: oldAccessPoint, name: 'name', defaults: 'none' })
	const newName = readAttribute({ record: newAccessPoint, name: 'name', defaults: 'none' })
	const device = places.read.get(move.ref.id)
	const ldInst = device
		? readAttribute({ record: device, name: 'inst', defaults: 'none' })
		: undefined
	const sent = sentControlBlocks({ places, move })
	if (sent.length === 0) return []
	const carried: CarriedAddress[] = []
	for (const record of places.document.records) {
		if (record.tagName !== CONNECTED_ACCESS_POINT_TAG) continue
		if (readAttribute({ record, name: 'iedName', defaults: 'none' }) !== iedName) continue
		if (readAttribute({ record, name: 'apName', defaults: 'none' }) !== oldName) continue
		const subNetwork = record.parent ? places.read.get(record.parent.id) : undefined
		if (!subNetwork) continue
		const connection = (places.childrenOf.get(subNetwork.id) ?? []).find(
			(sibling) =>
				sibling.tagName === CONNECTED_ACCESS_POINT_TAG &&
				readAttribute({ record: sibling, name: 'iedName', defaults: 'none' }) === iedName &&
				readAttribute({ record: sibling, name: 'apName', defaults: 'none' }) === newName,
		)
		for (const address of places.childrenOf.get(record.id) ?? []) {
			if (!sendsOneOf({ address, sent, ldInst })) continue
			carried.push({ address, from: record, subNetwork, connection })
		}
	}
	return carried
}

/** The control blocks with an address kind in a moved subtree, by their tag, with their uuid and name. */
function sentControlBlocks(params: MoveJudgedParams): AnyRawRecord[] {
	const { places, move } = params
	return places.document.records.filter(
		(record) =>
			ADDRESS_TAGS_BY_CONTROL_BLOCK.has(record.tagName) && places.movedBy.get(record.id) === move,
	)
}

/** Whether an address names one of the control blocks: by its uuid, else by its device and name. */
function sendsOneOf(params: {
	address: AnyRawRecord
	sent: readonly AnyRawRecord[]
	ldInst: string | undefined
}): boolean {
	const { address, sent, ldInst } = params
	const cbUuid = readAttribute({ record: address, name: 'cbUuid', defaults: 'none' })
	const cbName = readAttribute({ record: address, name: 'cbName', defaults: 'none' })
	const addressLdInst = readAttribute({ record: address, name: 'ldInst', defaults: 'none' })
	return sent.some(function named(controlBlock) {
		if (!(ADDRESS_TAGS_BY_CONTROL_BLOCK.get(controlBlock.tagName) ?? []).includes(address.tagName))
			return false
		const uuid = readAttribute({ record: controlBlock, name: UUID_ATTRIBUTE, defaults: 'none' })
		if (cbUuid) return cbUuid === uuid
		return (
			addressLdInst === ldInst &&
			cbName === readAttribute({ record: controlBlock, name: 'name', defaults: 'none' })
		)
	})
}

/** The children of a connection with an address placed after the last child of its tag, else where its kind goes. */
function withChildInOrder(params: {
	children: AnyRawRecord['children']
	child: AnyRawRecord
}): AnyRawRecord['children'] {
	const { children, child } = params
	const ref = { tagName: child.tagName, id: child.id } as AnyRawRecord['children'][number]
	const lastOfTag = children.map((held) => held.tagName).lastIndexOf(child.tagName)
	if (lastOfTag >= 0)
		return [...children.slice(0, lastOfTag + 1), ref, ...children.slice(lastOfTag + 1)]
	// GSE before SMV before what follows the addresses of a connection
	const firstAfter = children.findIndex(
		(held) => held.tagName === 'SMV' || held.tagName === 'PhysConn',
	)
	const at =
		child.tagName === 'SMV' ? children.findIndex((held) => held.tagName === 'PhysConn') : firstAfter
	return at < 0 ? [...children, ref] : [...children.slice(0, at), ref, ...children.slice(at)]
}

/** The id of the IED an element is, or sits in. */
function iedAt(params: { places: MovePlaces; id: string }): string | undefined {
	return nearestAt({ ...params, tagName: IED_TAG })?.id
}

/** The access point an element is, or sits in. */
function accessPointAt(params: { places: MovePlaces; id: string }): AnyRawRecord | undefined {
	return nearestAt({ ...params, tagName: ACCESS_POINT_TAG })
}

/** The logical device an element is, or sits in. */
function deviceAt(params: { places: MovePlaces; id: string }): AnyRawRecord | undefined {
	return nearestAt({ ...params, tagName: 'LDevice' })
}

/** The element of a tag an element is, or the nearest one above it, from the document read once. */
function nearestAt(params: {
	places: MovePlaces
	id: string
	tagName: string
}): AnyRawRecord | undefined {
	const { places, id, tagName } = params
	const record = places.read.get(id) ?? places.written.get(id)
	if (record?.tagName === tagName) return record
	return places.document.ancestryOf(id).findLast((above) => above.tagName === tagName)
}
