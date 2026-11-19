import { resolveSignalLogicalNode } from './resolve-signal-logical-node'

import type { ImplementationOnlyLNodes } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'
import type { LNodesByLogicalNode } from './implementation-only-lnodes.types'
import type { Scl } from '@/v2019C1/config'

/**
 * The LNodes of the process section mapped to each logical node, in document order: the mapping
 * the allocation of the signals reads (the `lnUuid` of an LNode first, else its names), turned
 * around once per call. Not the before-commit release of deleted logical nodes: that hook reads the
 * LNodes naming the logical nodes a transaction deletes; this reads none, it inverts what the call holds.
 */
export async function readLNodesByLogicalNode(params: {
	context: DataflowContext
}): Promise<LNodesByLogicalNode> {
	const { context } = params
	const { lnodes } = await context.processSection()
	const mapped = await context.mappedProcessLNodes()
	const byLogicalNode = new Map<string, Scl.Ref<'LNode'>[]>()
	for (const lnode of lnodes.values()) {
		const logicalNode = mapped.get(lnode.record.id)?.ln
		if (!logicalNode) continue
		const ref: Scl.Ref<'LNode'> = { tagName: 'LNode', id: lnode.record.id }
		byLogicalNode.set(logicalNode.id, [...(byLogicalNode.get(logicalNode.id) ?? []), ref])
	}
	return byLogicalNode
}

/**
 * The LNodes on both ends of an implementation-only ExtRef: those mapped to the logical node its
 * signal names (the uuid wins, else its names) and to the logical node holding it.
 */
export async function implementationOnlyLNodes(params: {
	extRef: IedNode<'ExtRef'>
	lnodesByLogicalNode: LNodesByLogicalNode
	context: DataflowContext
}): Promise<ImplementationOnlyLNodes> {
	const { extRef, lnodesByLogicalNode, context } = params
	const sender = await resolveSignalLogicalNode({ element: extRef, context })
	return {
		sender: sender ? (lnodesByLogicalNode.get(sender.record.id) ?? []) : [],
		subscriber: extRef.ln ? (lnodesByLogicalNode.get(extRef.ln.id) ?? []) : [],
	}
}
