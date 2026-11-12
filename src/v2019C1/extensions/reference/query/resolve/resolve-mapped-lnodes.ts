import { logicalNodePath } from '../build/logical-node-path'
import { collectWithAncestry } from '../find/collect-with-ancestry'
import { isNativeNode } from '../find/is-native-node'
import { mappedLNodeKey } from './mapped-lnode-key'
import { LOGICAL_NODES_SELECT } from './resolve-mapped-lnodes.constants'

import { readAttributes } from '@/v2019C1/helpers'

import type {
	LogicalNodeIndex,
	MappedLNode,
	MappedLNodes,
	ResolveMappedLNodesParams,
} from './resolve-mapped-lnodes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What implements each of the LNodes given: the `LN` or `LN0` and the IED holding it, read in one go
 * however many LNodes are asked about. A truthy `lnUuid` decides alone, even when it names nothing;
 * without one the complete name path of the LNode (`iedName`, `ldInst`, `prefix`, `lnClass`,
 * `lnInst`) does. Only the document's own logical nodes count: what sits inside a `Private` is vendor
 * payload, and an LNode never resolves to it. The LNodes asked about are answered from their own
 * attributes, wherever they sit.
 *
 * @intent which LN and IED implement these LNodes, resolve many mapped LNodes at once, LNode to IED without one read per LNode
 *
 * @example
 * const mapped = await resolveMappedLNodes(query, { lnodes })
 * mapped.get(lnode.id) // → { ln: { tagName: 'LN', id }, ied: { tagName: 'IED', id } }, or undefined
 */
export async function resolveMappedLNodes(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: ResolveMappedLNodesParams,
): Promise<MappedLNodes> {
	const read = await query.getRecords([...params.lnodes])
	const lnodes = read.filter((record) => record !== undefined)
	const index = await readLogicalNodeIndex(query)

	const mapped = new Map<string, MappedLNode>()
	for (const lnode of lnodes) {
		const implementer = implementerOf({ lnode, index })
		if (implementer) mapped.set(lnode.id, implementer)
	}
	return mapped
}

// ── Internal ─────────────────────────────────────────────────────────

/** The answer for one LNode, from its own attributes. */
function implementerOf(params: {
	lnode: Scl.TrackedRecord<'LNode'>
	index: LogicalNodeIndex
}): MappedLNode | undefined {
	const { lnode, index } = params
	const key = mappedLNodeKey(lnode)
	if (!key) return undefined
	return key.kind === 'uuid' ? index.byUuid.get(key.uuid) : index.byPath.get(key.path)
}

/** One read of the logical nodes of the document's IEDs; of two claiming a key, the first in document order. */
async function readLogicalNodeIndex(
	query: Core.Query<Config> | Core.Transaction<Config>,
): Promise<LogicalNodeIndex> {
	const { records, ancestryOf } = await collectWithAncestry(query, { select: LOGICAL_NODES_SELECT })
	const byUuid = new Map<string, MappedLNode>()
	const byPath = new Map<string, MappedLNode>()
	for (const record of records) {
		if (record.tagName !== 'LN' && record.tagName !== 'LN0') continue
		const ancestry = ancestryOf(record.id)
		const ied = ancestry.find((ancestor) => ancestor.tagName === 'IED')
		if (!ied || !isNativeNode({ record, ancestry })) continue
		const mapped = {
			ln: { tagName: record.tagName, id: record.id },
			ied: { tagName: 'IED', id: ied.id },
		} satisfies MappedLNode
		const { uuid } = readAttributes({ record, defaults: 'none' })
		if (uuid && !byUuid.has(uuid)) byUuid.set(uuid, mapped)
		const path = logicalNodePath({ record, ancestry })
		if (path && !byPath.has(path)) byPath.set(path, mapped)
	}
	return { byUuid, byPath }
}
