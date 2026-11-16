import { toRawRecord } from '@dialecte/core/helpers'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { mappedLNodeKey } from '@/v2019C1/extensions/reference/query/resolve/mapped-lnode-key'
import {
	implementerOf,
	readLogicalNodeIndex,
} from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'
import { readAttribute } from '@/v2019C1/helpers'
import { readHoldingLNodes } from '@/v2019C1/hooks/shared/read-holding-lnodes'
import { reconcileMappedData } from '@/v2019C1/hooks/shared/reconcile-mapped-data'
import { DATA_HOLDER_DEPTH } from '@/v2019C1/hooks/shared/reconcile-mapped-data-below.constants'

import type { ReconcileMappedDataOfLNodesParams } from './reconcile-mapped-data-below.types'
import type { ReconcileMappedDataParams } from './reconcile-mapped-data.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	MappedLNode,
	MappedLNodes,
} from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'
import type * as Core from '@dialecte/core'

/**
 * After a change to an `LNode` or a `DOS` / `SDS` that moves the default of the data below it,
 * re-store every `DOS` / `SDS` / `DAS` below that names its implementation: an implementation
 * that became the default loses its attributes. Records that name nothing follow the new
 * default by themselves.
 */
export async function reconcileMappedDataBelow(
	query: Core.Query<Config>,
	params: ReconcileMappedDataParams,
): Promise<Scl.Operation[]> {
	const { record } = params
	const descendants = await query.findDescendants({
		tagName: record.tagName,
		id: record.id,
	} as Scl.Ref<Scl.ElementsOf>)

	const operations: Scl.Operation[] = []
	for (const [tagName, attributeNames] of MAPPED_NAME_REFS) {
		const records = (descendants as Record<string, Scl.TrackedRecord<Scl.ElementsOf>[]>)[tagName]
		for (const descendant of records ?? []) {
			if (descendant.id === record.id) continue
			const namesImplementation = [attributeNames.path, attributeNames.uuid].some(
				(name) =>
					readAttribute({ record: descendant, name, defaults: 'none', fullObject: true }) !==
					undefined,
			)
			if (!namesImplementation) continue
			const operation = await reconcileMappedData(query, { record: toRawRecord(descendant) })
			if (operation) operations.push(operation)
		}
	}
	return operations
}

/**
 * {@link reconcileMappedDataBelow} for many LNodes whose binding a hook rewrote and has not staged (`lnodes`, as
 * rewritten): what implements each is read from those records, in one read of the document's logical nodes when one
 * of them names a logical node at all; the `DOS` / `SDS` / `DAS` of each tag are read once, climbed among themselves
 * to the record holding them, then a level at a time to the LNode; each one naming its implementation below one of
 * the LNodes is stored in its canonical form (`reconcileMappedData`, told what implements the LNodes).
 */
export async function reconcileMappedDataOfLNodes(
	query: Core.Query<Config>,
	params: ReconcileMappedDataOfLNodesParams,
): Promise<Scl.Operation[]> {
	const { lnodes } = params
	if (lnodes.length === 0) return []
	const { mappedLNodes, implementerUuidOf } = await readMappedLNodesOf(query, { lnodes })
	// a record on no implementer keeps its explicit naming: only one naming its LNode's implementer can change
	const implementerUuids = new Set(implementerUuidOf.values())
	if (implementerUuids.size === 0) return []
	const data = await readNamingData(query)
	// one named by path only (written while nothing resolved it) is stored in full once its LNode has an implementer
	const candidates = data.filter(
		(record) => namesByPathOnly(record) || namesOneOf({ record, uuids: implementerUuids }),
	)
	if (candidates.length === 0) return []

	const dataById = new Map(data.map((record) => [record.id, record]))
	const topOf = new Map(candidates.map((record) => [record.id, topDataOf({ record, dataById })]))
	const lnodeOfTop = await readHoldingLNodes(query, {
		records: [...new Map([...topOf.values()].map((top) => [top.id, top])).values()],
		lnodeIds: new Set(implementerUuidOf.keys()),
		depth: DATA_HOLDER_DEPTH,
	})
	const survivors = candidates.filter((record) => {
		const top = topOf.get(record.id)
		const lnodeId = top && lnodeOfTop.get(top.id)
		if (lnodeId === undefined) return false
		return (
			namesByPathOnly(record) ||
			namesOneOf({ record, uuids: new Set([implementerUuidOf.get(lnodeId)]) })
		)
	})

	const operations: Scl.Operation[] = []
	for (const record of survivors) {
		const operation = await reconcileMappedData(query, { record, mappedLNodes })
		if (operation) operations.push(operation)
	}
	return operations
}

/**
 * What implements each LNode as written, read in one index of the document's logical nodes, none when none names one;
 * and the uuid of that logical node, by LNode id.
 */
async function readMappedLNodesOf(
	query: Core.Query<Config>,
	params: ReconcileMappedDataOfLNodesParams,
): Promise<{ mappedLNodes: MappedLNodes; implementerUuidOf: Map<string, string> }> {
	const { lnodes } = params
	const naming = lnodes.filter((lnode) => mappedLNodeKey(lnode) !== undefined)
	if (naming.length === 0) return { mappedLNodes: new Map(), implementerUuidOf: new Map() }
	const index = await readLogicalNodeIndex(query)
	const uuidOfLn = new Map([...index.byUuid].map(([uuid, mapped]) => [mapped.ln.id, uuid]))
	const mappedLNodes = new Map<string, MappedLNode>()
	const implementerUuidOf = new Map<string, string>()
	for (const lnode of naming) {
		const implementer = implementerOf({ lnode, index })
		if (!implementer) continue
		mappedLNodes.set(lnode.id, implementer)
		const uuid = uuidOfLn.get(implementer.ln.id)
		if (uuid) implementerUuidOf.set(lnode.id, uuid)
	}
	return { mappedLNodes, implementerUuidOf }
}

/** Whether a data record names its implementation by its data path alone, without the uuid of its logical node. */
function namesByPathOnly(record: Scl.RawRecord<Scl.ElementsOf>): boolean {
	const attributeNames = MAPPED_NAME_REFS.get(record.tagName)
	if (!attributeNames) return false
	function written(name: string): boolean {
		return readAttribute({ record, name, defaults: 'none', fullObject: true })?.value !== undefined
	}
	return written(attributeNames.path) && !written(attributeNames.uuid)
}

/** Whether a data record names, by its explicit logical node uuid, one of `uuids`. */
function namesOneOf(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	uuids: ReadonlySet<string | undefined>
}): boolean {
	const { record, uuids } = params
	const attributeNames = MAPPED_NAME_REFS.get(record.tagName)
	if (!attributeNames) return false
	const uuid = readAttribute({
		record,
		name: attributeNames.uuid,
		defaults: 'none',
		fullObject: true,
	})?.value
	return uuid !== undefined && uuids.has(uuid)
}

/** The `DOS` / `SDS` / `DAS` of the document naming their implementation, each tag read once. */
async function readNamingData(query: Core.Query<Config>): Promise<Scl.RawRecord<Scl.ElementsOf>[]> {
	const byTag = await Promise.all(
		[...MAPPED_NAME_REFS].map(async function readDataOfTag([tagName, attributeNames]) {
			// dialecte-allow query-in-loop: one read per data tag (DOS, SDS, DAS): core reads one tag per call
			const records = await query.getRecordsByTagName(tagName as Scl.ElementsOf)
			return records.flatMap((record) => {
				const names = [attributeNames.path, attributeNames.uuid].some(
					(name) =>
						readAttribute({ record, name, defaults: 'none', fullObject: true }) !== undefined,
				)
				return names ? [toRawRecord(record) as Scl.RawRecord<Scl.ElementsOf>] : []
			})
		}),
	)
	return byTag.flat()
}

/**
 * The outermost data record above a record, climbing through the data records held (a `DAS` in an `SDS` in a `DOS`):
 * the one whose parent is no data record held.
 */
function topDataOf(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	dataById: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): Scl.RawRecord<Scl.ElementsOf> {
	const { dataById } = params
	let top = params.record
	for (
		let above = top.parent && dataById.get(top.parent.id);
		above;
		above = top.parent && dataById.get(top.parent.id)
	)
		top = above
	return top
}
