import { resolveControlBlock } from './resolve-control-block'

import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'

/**
 * The ExtRefs naming each control block, by the id of the control block, in document order: each
 * ExtRef goes to the control block `resolveControlBlock` finds for it, by its uuid or by its names.
 */
export async function readExtRefsByControlBlock(params: {
	context: DataflowContext
}): Promise<ReadonlyMap<string, readonly IedNode<'ExtRef'>[]>> {
	const { context } = params
	const { extRefs } = await context.iedSection()
	const byControlBlock = new Map<string, IedNode<'ExtRef'>[]>()
	for (const extRef of extRefs) {
		const controlBlock = await resolveControlBlock({ extRef, context })
		if (!controlBlock) continue
		const held = byControlBlock.get(controlBlock.record.id) ?? []
		held.push(extRef)
		byControlBlock.set(controlBlock.record.id, held)
	}
	return byControlBlock
}
