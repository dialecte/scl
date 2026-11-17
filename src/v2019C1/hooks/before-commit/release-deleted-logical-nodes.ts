import {
	LNODE_BINDING_PAIR,
	LOGICAL_NODE_TAG_NAMES,
} from './release-deleted-logical-nodes.constants'
import { readAncestries } from './tuple-names'

import { toRawRecord } from '@dialecte/core/helpers'

import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { planLNodeReleases } from '@/v2019C1/extensions/data-model/query/plan-lnode-releases'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { readAttribute } from '@/v2019C1/helpers'
import {
	reconcileMappedDataOfLNodes,
	reconcileSignalAddressesOfLNodes,
} from '@/v2019C1/hooks/shared'
import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'

import type {
	DeletedLogicalNodes,
	ReleaseLNodesOfDeletedLogicalNodesParams,
} from './release-deleted-logical-nodes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The LNodes bound to a logical node the transaction deleted (by its `lnUuid`, or by their names without one) are
 * released, as a release does (`planLNodeReleases`): back to the logical node of the specification IED they are
 * specified on when the document still holds it, else on no IED. A logical node deleted and created again (same uuid,
 * same address) is not deleted. Read once for the whole transaction, after it: what it deleted, in any order, and
 * which specification IEDs it kept decide. Nothing is read when it deleted no logical node. The addresses of the
 * released LNodes' signals are written again from where they now stand (`reconcileSignalAddressesOfLNodes`), and the
 * data below them stored in its canonical form (`reconcileMappedDataOfLNodes`), as a release in the transaction does.
 */
export async function releaseLNodesOfDeletedLogicalNodes(
	query: Core.Query<Config>,
	params: ReleaseLNodesOfDeletedLogicalNodesParams,
): Promise<Scl.Operation[]> {
	const { operations, pending } = params
	const deleted = await readDeletedLogicalNodes(query, { operations })
	if (deleted.uuids.size === 0 && deleted.addresses.size === 0) return []

	const lnodes = (await query.getRecordsByTagName('LNode')).map(function asWritten(record) {
		return pending.get(record.id) ?? (toRawRecord(record) as AnyRawRecord)
	})
	const released = lnodesBoundTo({ lnodes, logicalNodes: deleted })
	if (released.length === 0) return []

	const plan = await planLNodeReleases(query, { lnodes: released })
	const updates = released.flatMap(function releaseOne(lnode) {
		const attributes = plan.get(lnode.id)
		if (!attributes) return []
		const values = Object.entries(attributes).map(([name, value]) => ({ name, value }))
		const written = withAttributeValues(lnode.attributes, values)
		if (written === lnode.attributes) return []
		const operation = updatedOperation(lnode as Scl.RawRecord<Scl.ElementsOf>, written)
		return operation.status === 'updated' ? [operation] : []
	})
	const signals = await reconcileSignalAddressesOfLNodes(query, {
		updates,
		pendingOperations: updates,
	})
	// the data below each in its canonical form, as the binding the release wrote leaves it (not staged yet)
	const data = await reconcileMappedDataOfLNodes(query, {
		lnodes: updates.map((update) => update.newRecord),
	})
	return [...updates, ...signals, ...data]
}

/**
 * The uuids and addresses of the logical nodes the operations delete, but those they create again (and do not delete
 * after): the records above each read a level at a time, a deleted one taken from the operations.
 */
async function readDeletedLogicalNodes(
	query: Core.Query<Config>,
	params: { operations: ReadonlyArray<Scl.Operation> },
): Promise<DeletedLogicalNodes> {
	const { operations } = params
	const held = new Map<string, AnyRawRecord>()
	const deleted: AnyRawRecord[] = []
	const created: AnyRawRecord[] = []
	for (const operation of operations) {
		if (operation.status === 'deleted') {
			const record = operation.oldRecord as AnyRawRecord
			held.set(record.id, record)
			if (LOGICAL_NODE_TAG_NAMES.has(record.tagName)) deleted.push(record)
		} else if (
			operation.status === 'created' &&
			LOGICAL_NODE_TAG_NAMES.has(operation.newRecord.tagName)
		) {
			created.push(operation.newRecord as AnyRawRecord)
		}
	}
	if (deleted.length === 0) return { uuids: new Set(), addresses: new Set() }
	// a logical node the transaction created and deleted again is gone, not created again
	const kept = created.filter((record) => !held.has(record.id))

	const gone = await readLogicalNodeKeys(query, { records: deleted, held })
	const again = await readLogicalNodeKeys(query, { records: kept, held })
	return {
		uuids: new Set([...gone.uuids].filter((uuid) => !again.uuids.has(uuid))),
		addresses: new Set([...gone.addresses].filter((address) => !again.addresses.has(address))),
	}
}

/**
 * The uuids and tuple addresses of logical nodes, the records above them read a level at a time (a record of `held`
 * taken from there, not read): what an LNode bound to one of them names it by.
 */
export async function readLogicalNodeKeys(
	query: Core.Query<Config>,
	params: { records: readonly AnyRawRecord[]; held?: ReadonlyMap<string, AnyRawRecord> },
): Promise<DeletedLogicalNodes> {
	const { records } = params
	if (records.length === 0) return { uuids: new Set(), addresses: new Set() }
	const ancestries = await readAncestries({ records, query, held: params.held })
	const uuids = records.flatMap((record) => {
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none', fullObject: true })?.value
		return uuid ? [uuid] : []
	})
	const addresses = records.flatMap((record) => {
		const address = targetTupleAddress({ record, ancestry: ancestries.get(record.id) ?? [] })
		return address ? [address] : []
	})
	return { uuids: new Set(uuids), addresses: new Set(addresses) }
}

/** The LNodes, among those given, bound to one of the logical nodes named: they are released when those go. */
export function lnodesBoundTo(params: {
	lnodes: readonly AnyRawRecord[]
	logicalNodes: DeletedLogicalNodes
}): AnyRawRecord[] {
	return params.lnodes.filter((lnode) => isBoundToDeleted({ lnode, deleted: params.logicalNodes }))
}

/** Whether an LNode bound to an IED names, by its `lnUuid` or (without one) by its names, a deleted logical node. */
function isBoundToDeleted(params: { lnode: AnyRawRecord; deleted: DeletedLogicalNodes }): boolean {
	const { lnode, deleted } = params
	const iedName = readAttribute({
		record: lnode,
		name: 'iedName',
		defaults: 'none',
		fullObject: true,
	})?.value
	if (!isAssignedToIed({ iedName })) return false
	const lnUuid = readAttribute({
		record: lnode,
		name: 'lnUuid',
		defaults: 'none',
		fullObject: true,
	})?.value
	if (lnUuid) return deleted.uuids.has(lnUuid)
	const address = referrerTupleAddress({ pair: LNODE_BINDING_PAIR, record: lnode, ancestry: [] })
	return address !== undefined && deleted.addresses.has(address)
}
