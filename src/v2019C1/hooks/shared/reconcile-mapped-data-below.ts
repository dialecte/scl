import { toRawRecord } from '@dialecte/core/helpers'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { mappedLNodeKey } from '@/v2019C1/extensions/reference/query/resolve/mapped-lnode-key'
import {
	implementerOf,
	readLogicalNodeIndex,
} from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes'
import { readAttribute } from '@/v2019C1/helpers'
import { inTagReadOrder } from '@/v2019C1/hooks/shared/in-tag-read-order'
import { reconcileMappedData } from '@/v2019C1/hooks/shared/reconcile-mapped-data'
import { DATA_HOLDER_DEPTH } from '@/v2019C1/hooks/shared/reconcile-mapped-data-below.constants'

import type {
	DataBelow,
	ReconcileMappedDataOfLNodesParams,
} from './reconcile-mapped-data-below.types'
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
 * of them names a logical node at all; the `DOS` / `SDS` / `DAS` below the LNodes are read a level at a time from
 * them (`readNamingDataBelow`), climbed among themselves to the record holding them; each one naming its implementation below one of
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
	const below = await readNamingDataBelow(query, { lnodeIds: new Set(implementerUuidOf.keys()) })
	const data = below.map(({ record }) => record)
	// one named by path only (written while nothing resolved it) is stored in full once its LNode has an implementer
	const candidates = data.filter(
		(record) => namesByPathOnly(record) || namesOneOf({ record, uuids: implementerUuids }),
	)
	if (candidates.length === 0) return []

	const dataById = new Map(data.map((record) => [record.id, record]))
	const foundById = new Map(below.map((found) => [found.record.id, found]))
	const topOf = new Map(candidates.map((record) => [record.id, topDataOf({ record, dataById })]))
	// the LNode holding a top data record within `DATA_HOLDER_DEPTH` levels, as a climb from it finds it
	const lnodeOfTop = new Map(
		[...topOf.values()].flatMap((top) => {
			const found = foundById.get(top.id)
			return found && found.level <= DATA_HOLDER_DEPTH ? [[top.id, found.lnodeId] as const] : []
		}),
	)
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

/**
 * The `DOS` / `SDS` / `DAS` naming their implementation below the LNodes, with the level each sits at below its LNode:
 * read a level at a time from the LNodes, following the children of the LNode, the data tags below them and, within
 * `DATA_HOLDER_DEPTH`, the records holding data (a `Private`), never an LNode below an LNode; never a whole data tag.
 * In tag order, each tag in the order its tag read lists them (`inTagReadOrder`).
 */
async function readNamingDataBelow(
	query: Core.Query<Config>,
	params: { lnodeIds: ReadonlySet<string> },
): Promise<DataBelow[]> {
	const lnodes = await query.getRecords(
		[...params.lnodeIds].map((id): Scl.Ref<Scl.ElementsOf> => ({ tagName: 'LNode', id })),
	)
	const found: DataBelow[] = []
	const tracked: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	let frontier = lnodes.flatMap((lnode) =>
		lnode
			? followedChildren({ record: lnode, level: 0 }).map((ref) => ({ ref, lnodeId: lnode.id }))
			: [],
	)
	for (let level = 1; frontier.length > 0; level++) {
		// dialecte-allow query-in-loop: one read per level below the LNodes, never per record
		const records = await query.getRecords(frontier.map(({ ref }) => ref))
		const next: typeof frontier = []
		records.forEach(function followRecord(record, position) {
			if (!record) return
			const { lnodeId } = frontier[position]
			if (MAPPED_NAME_REFS.has(record.tagName)) {
				tracked.push(record)
				found.push({ record: toRawRecord(record) as Scl.RawRecord<Scl.ElementsOf>, level, lnodeId })
			}
			for (const ref of followedChildren({ record, level })) next.push({ ref, lnodeId })
		})
		frontier = next
	}
	const recordById = new Map(found.map((entry) => [entry.record.id, entry]))
	const byTag = await Promise.all(
		[...MAPPED_NAME_REFS].map(async function orderDataOfTag([tagName, attributeNames]) {
			const naming = tracked.filter(
				(record) =>
					record.tagName === tagName &&
					[attributeNames.path, attributeNames.uuid].some(
						(name) =>
							readAttribute({ record, name, defaults: 'none', fullObject: true }) !== undefined,
					),
			)
			// dialecte-allow query-in-loop: one ordering per data tag, a tag read only when the transaction wrote one of them
			const ordered = await inTagReadOrder(query, {
				tagName: tagName as Scl.ElementsOf,
				lookups: naming.map((record) => [record]),
			})
			return ordered.flatMap((record) => recordById.get(record.id) ?? [])
		}),
	)
	return byTag.flat()
}

/**
 * The children of a record read below an LNode that may hold data within reach: below a data record its data, below
 * the LNode or a record holding data (within `DATA_HOLDER_DEPTH`) the data and the records that may hold some; none
 * below an LNode below the LNode.
 */
function followedChildren(params: {
	record: Pick<Scl.RawRecord<Scl.ElementsOf>, 'tagName' | 'children'>
	level: number
}): Scl.Ref<Scl.ElementsOf>[] {
	const { record, level } = params
	const isData = MAPPED_NAME_REFS.has(record.tagName)
	if (!isData && level > 0 && record.tagName === 'LNode') return []
	if (!isData && level >= DATA_HOLDER_DEPTH) return []
	const holdersWithinReach = !isData && level + 1 < DATA_HOLDER_DEPTH
	return record.children.filter(
		(child) => MAPPED_NAME_REFS.has(child.tagName) || holdersWithinReach,
	) as Scl.Ref<Scl.ElementsOf>[]
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
