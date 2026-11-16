import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import {
	boundLogicalNodeOf,
	specificationIedIndex,
	specifiedLNodeOf,
} from '@/v2019C1/extensions/data-model/naming/specification-ied'
import { readIedKinds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { mappedLNodeKey } from '@/v2019C1/extensions/reference/query/resolve/mapped-lnode-key'
import { readAttributes } from '@/v2019C1/helpers'

import type { BoundLNodes } from './bound-logical-nodes.types'
import type { Config } from '@/v2019C1/config'
import type { SpecifiedLNode } from '@/v2019C1/extensions/data-model/naming/specification-ied.types'
import type * as Core from '@dialecte/core'

/**
 * The specification IED each LNode the commit binds is specified on, by LNode id, with the logical device it names
 * there and the names a new naming of it is built from ({@link specifiedLNodeOf}): the one holding the logical node
 * its `lnUuid` names (the names that logical node's), else the one its `iedName` names. The kind of every IED is read once (by tag), and only when some LNode can be specified; the
 * logical nodes are the ones the commit already read ({@link readBoundLNodes}).
 */
export async function specificationIedsOfCreated(params: {
	query: Core.Query<Config>
	bound: BoundLNodes
}): Promise<Map<string, SpecifiedLNode>> {
	const { query, bound } = params
	const candidates = bound.lnodes.flatMap((record) => {
		const lnodeAttributes = readAttributes({ record, defaults: 'none' })
		const key = mappedLNodeKey(record)
		const held = key?.kind === 'uuid' ? bound.logicalNodesByUuid.get(key.uuid) : undefined
		const boundLogicalNode = held && boundLogicalNodeOf(held)
		return boundLogicalNode || isAssignedToIed({ iedName: lnodeAttributes.iedName })
			? [{ id: record.id, lnodeAttributes, boundLogicalNode }]
			: []
	})
	if (candidates.length === 0) return new Map()

	const kinds = await readIedKinds(query)
	const index = specificationIedIndex({
		kinds: kinds.map(({ ied, name, kind }) => ({ iedId: ied.id, name, kind })),
	})
	if (index.nameById.size === 0) return new Map()

	const found = new Map<string, SpecifiedLNode>()
	for (const { id, lnodeAttributes, boundLogicalNode } of candidates) {
		const specified = specifiedLNodeOf({ lnodeAttributes, boundLogicalNode, index })
		if (specified.specificationIed) found.set(id, specified)
	}
	return found
}
