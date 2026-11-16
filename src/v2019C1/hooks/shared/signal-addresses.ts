import { readHoldingLNodes } from './read-holding-lnodes'
import { SIGNAL_ADDRESS_PAIRS_BY_REF, SIGNAL_HOLDER_DEPTH } from './signal-addresses.constants'

import { toRawRecord } from '@dialecte/core/helpers'

import { LNODE_BINDING_ATTRIBUTES } from '@/v2019C1/extensions/reference'
import { buildMappedLNodePath } from '@/v2019C1/extensions/reference/query/build/build-mapped-lnode-path'
import { buildReferenceAttributes } from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import { readAttribute, readAttributes } from '@/v2019C1/helpers'
import {
	hasAttributeChange,
	updatedOperation,
	withAttributeValues,
} from '@/v2019C1/hooks/shared/record-ops'
import { findTargetByUuid } from '@/v2019C1/hooks/shared/ref-entry-ops'

import type { HeldSignal, ReboundLNode } from './signal-addresses.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { RefPairEntry } from '@/v2019C1/extensions/reference/constants'
import type { ReferrerContext } from '@/v2019C1/extensions/reference/query/build/compose-reference-path.types'
import type { AttributeList } from '@/v2019C1/hooks/shared/record-ops'
import type * as Core from '@dialecte/core'

/**
 * The address a signal of an LNode writes for the element implementing it depends on where that
 * element sits relative to the logical node the LNode is mapped to. When the LNode's binding changes
 * (`lnUuid`, or the naming that stands for it), the address of each of its own signals is written
 * again, from the mapping as `pendingOperations` leave it: the operations returned before this one,
 * not yet applied (`reconcileLNodeBinding`'s, or the rename cascade's). A signal one of them updates
 * is written over that update, so the last update of it keeps everything.
 *
 * This is the one place where an address that cannot be composed (the element has no internal
 * address) is removed rather than left: the stale one would name another place. Everything rebuilt
 * for a signal lands in one update of it.
 */
export async function reconcileSignalAddresses(
	query: Core.Query<Config>,
	params: {
		oldRecord: Scl.RawRecord<Scl.ElementsOf>
		newRecord: Scl.RawRecord<Scl.ElementsOf>
		pendingOperations: readonly Scl.Operation[]
	},
): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, pendingOperations } = params
	if (newRecord.tagName !== 'LNode') return []
	if (!hasAttributeChange({ oldRecord, newRecord, names: LNODE_BINDING_ATTRIBUTES })) return []

	const lnode = pendingRecordOf({ pendingOperations, id: newRecord.id }) ?? newRecord
	// `lnode` is the LNode as the pending operations leave it, which the transaction has not staged
	// yet: a read through the query would give the LNode as staged, without the binding
	const referrerContext = {
		mappedLnPath: buildMappedLNodePath(readAttributes({ record: lnode, defaults: 'none' })),
	}

	const descendants = await query.findDescendants({ tagName: 'LNode', id: newRecord.id })
	const operations: Scl.Operation[] = []
	for (const [tagName, pairs] of SIGNAL_ADDRESS_PAIRS_BY_REF) {
		for (const signal of descendants[tagName as keyof typeof descendants] ?? []) {
			const record = pendingRecordOf({ pendingOperations, id: signal.id }) ?? toRawRecord(signal)
			const reference = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
			let attributes: AttributeList = record.attributes
			for (const pair of pairs) {
				const uuid = await query.any.getAttribute(record, { name: pair.uuidAttr })
				const target = uuid
					? await findTargetByUuid(query, { uuid, targetTagNames: pair.targetTagNames })
					: undefined
				if (!target) continue
				attributes = await composeSignalAddress(query, {
					reference,
					pair,
					target,
					referrerContext,
					attributes,
				})
			}
			if (attributes !== record.attributes) operations.push(updatedOperation(record, attributes))
		}
	}
	return operations
}

/**
 * The signal addresses of many LNodes whose binding a hook rewrote ({@link reconcileSignalAddresses} for each, read
 * once for all of them): the signals of each tag and the elements holding them are read once, the signals under one
 * of the LNodes given are kept, and the elements their uuids name are read once per target tag. Nothing is read past
 * the signals when none of the LNodes holds one naming an element by uuid.
 */
export async function reconcileSignalAddressesOfLNodes(
	query: Core.Query<Config>,
	params: { updates: readonly ReboundLNode[]; pendingOperations: readonly Scl.Operation[] },
): Promise<Scl.Operation[]> {
	const { pendingOperations } = params
	const updates = params.updates.filter(({ oldRecord, newRecord }) =>
		hasAttributeChange({ oldRecord, newRecord, names: LNODE_BINDING_ATTRIBUTES }),
	)
	if (updates.length === 0) return []
	const lnodeById = new Map(
		updates.map(({ newRecord }) => [
			newRecord.id,
			pendingRecordOf({ pendingOperations, id: newRecord.id }) ?? newRecord,
		]),
	)

	const signals = await readSignalsOf(query, { lnodeIds: new Set(lnodeById.keys()) })
	const wanted = signals.flatMap(({ record, pairs }) =>
		pairs.flatMap((pair) => {
			const uuid = readAttribute({
				record,
				name: pair.uuidAttr,
				defaults: 'none',
				fullObject: true,
			})?.value
			return uuid ? [{ pair, uuid }] : []
		}),
	)
	if (wanted.length === 0) return []
	const targets = await readTargetsByUuid(query, { wanted })

	const operations: Scl.Operation[] = []
	for (const held of signals) {
		const lnode = lnodeById.get(held.lnodeId)
		if (!lnode) continue
		const record = pendingRecordOf({ pendingOperations, id: held.record.id }) ?? held.record
		const operation = await rewriteSignalAddresses(query, {
			record,
			pairs: held.pairs,
			lnode,
			targets,
		})
		if (operation) operations.push(operation)
	}
	return operations
}

/** One update of a signal writing its addresses from where its LNode now stands; none when nothing changes. */
async function rewriteSignalAddresses(
	query: Core.Query<Config>,
	params: {
		record: Scl.RawRecord<Scl.ElementsOf>
		pairs: readonly RefPairEntry[]
		lnode: Scl.RawRecord<Scl.ElementsOf>
		targets: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>
	},
): Promise<Scl.Operation | undefined> {
	const { record, pairs, lnode, targets } = params
	const referrerContext = {
		mappedLnPath: buildMappedLNodePath(readAttributes({ record: lnode, defaults: 'none' })),
	}
	const reference = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
	let attributes: AttributeList = record.attributes
	for (const pair of pairs) {
		const uuid = readAttribute({
			record,
			name: pair.uuidAttr,
			defaults: 'none',
			fullObject: true,
		})?.value
		const target = uuid ? targets.get(uuid) : undefined
		if (!target || !pair.targetTagNames.includes(target.tagName)) continue
		attributes = await composeSignalAddress(query, {
			reference,
			pair,
			target,
			referrerContext,
			attributes,
		})
	}
	return attributes === record.attributes ? undefined : updatedOperation(record, attributes)
}

/**
 * The attributes of a signal once its reference to `target` is written from where the LNode's logical node sits: the
 * values `buildReferenceAttributes` composes, its address removed when none can be composed.
 */
async function composeSignalAddress(
	query: Core.Query<Config>,
	params: {
		reference: Scl.Ref<Scl.ElementsOf>
		pair: RefPairEntry
		target: Scl.Ref<Scl.ElementsOf>
		referrerContext: ReferrerContext
		attributes: AttributeList
	},
): Promise<AttributeList> {
	const { reference, pair, target, referrerContext, attributes } = params
	const values = await buildReferenceAttributes(query, { reference, target, referrerContext })
	const hasAddress = values.some((value) => value.name === pair.pathAttr)
	return withAttributeValues(
		attributes,
		hasAddress ? values : [...values, { name: pair.pathAttr, value: undefined }],
	)
}

/**
 * The signals (every tag of `SIGNAL_ADDRESS_PAIRS_BY_REF`) held by one of the LNodes, each tag read once; the records
 * above them (their inputs or outputs, the `Private` holding those) read a level at a time up to the LNode.
 */
async function readSignalsOf(
	query: Core.Query<Config>,
	params: { lnodeIds: ReadonlySet<string> },
): Promise<HeldSignal[]> {
	const { lnodeIds } = params
	const byTag = await Promise.all(
		[...SIGNAL_ADDRESS_PAIRS_BY_REF].map(async function readSignalsOfTag([tagName, pairs]) {
			// dialecte-allow query-in-loop: one read per signal tag: core reads one tag per call
			const records = await query.getRecordsByTagName(tagName as Scl.ElementsOf)
			return records.map((record) => ({ record: toRawRecord(record), pairs }))
		}),
	)
	const all = byTag.flat()
	const lnodeOf = await readHoldingLNodes(query, {
		records: all.map(({ record }) => record),
		lnodeIds,
		depth: SIGNAL_HOLDER_DEPTH,
	})
	return all.flatMap(({ record, pairs }) => {
		const lnodeId = lnodeOf.get(record.id)
		return lnodeId ? [{ record, pairs, lnodeId }] : []
	})
}

/** The elements the signals name by uuid, each target tag read once. */
async function readTargetsByUuid(
	query: Core.Query<Config>,
	params: { wanted: readonly { pair: RefPairEntry; uuid: string }[] },
): Promise<Map<string, Scl.Ref<Scl.ElementsOf>>> {
	const { wanted } = params
	const uuids = new Set(wanted.map(({ uuid }) => uuid))
	const tagNames = new Set(wanted.flatMap(({ pair }) => pair.targetTagNames))
	const byTag = await Promise.all(
		[...tagNames].map(function readTargetsOfTag(tagName) {
			// dialecte-allow query-in-loop: one read per target tag: core reads one tag per call
			return query.getRecordsByTagName(tagName as Scl.ElementsOf)
		}),
	)
	const targets = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const record of byTag.flat()) {
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none', fullObject: true })?.value
		if (uuid && uuids.has(uuid) && !targets.has(uuid))
			targets.set(uuid, { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>)
	}
	return targets
}

/** A record as the last of the pending operations updating it leaves it. */
function pendingRecordOf(params: {
	pendingOperations: readonly Scl.Operation[]
	id: string
}): Scl.RawRecord<Scl.ElementsOf> | undefined {
	const { pendingOperations, id } = params
	return pendingOperations.findLast((operation) => operation.newRecord?.id === id)?.newRecord
}
