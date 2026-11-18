import {
	findNamedRecords,
	namedTargetsOf,
} from '@/v2019C1/extensions/reference/query/find/named-targets'

import type { InstanceReader } from './instance.types'
import type { NamedTarget } from '@/v2019C1/extensions/reference/query/find/named-targets.types'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The record ids of the elements that belong to an instance: the elements of its subtree and the
 * elements its references point at — by a uuid pair or a tuple pair (a data set entry, an input),
 * an LNode's binding left out. What tells the elements of one instance from those of another
 * instance of the same template. One read of the subtree, one of each tag its references name.
 */
export async function collectInstanceScope(
	reader: InstanceReader,
	instanceRootRef: AnyRefOrRecord,
): Promise<Set<string>> {
	const instanceTree = await reader.any.getTree(instanceRootRef)
	if (!instanceTree) return new Set()
	const nodes = subtreeOf({ node: instanceTree })
	const named = nodes.flatMap((node) => namedTargetsOf(node))
	const namedRecords = await findNamedRecords(reader, { named })
	const referenced = named.flatMap((target: NamedTarget) =>
		(namedRecords.get(target.uuid) ?? [])
			.filter((record) => target.target.includes(record.tagName))
			.map((record) => record.id),
	)
	return new Set([...nodes.map((node) => node.id), ...referenced])
}

/** A node and every node below it. */
function subtreeOf(params: { node: AnyTreeRecord }): AnyTreeRecord[] {
	const nodes: AnyTreeRecord[] = []
	const pending: AnyTreeRecord[] = [params.node]
	while (pending.length > 0) {
		const node = pending.pop() as AnyTreeRecord
		nodes.push(node)
		pending.push(...node.tree)
	}
	return nodes
}
