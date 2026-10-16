import { LNODE_LN_UUID_ATTRIBUTE } from '../constants/lnode.constants'

import { buildMappedLNodePath } from '@/v2019C1/extensions/reference/query/build/build-mapped-lnode-path'

import type { SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { SectionNode } from './section-node.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Where the two LNodes of a signal are implemented: the IED of the LN each is mapped to. Both in
 * one IED is `same-ied`, in two `inter-ied`; `unallocated` when one is not mapped to an LN of the
 * document (or the signal names no other LNode). The IEDs are returned with it.
 */
export async function resolveAllocation(params: {
	holder: SectionNode<'LNode'>
	other: SectionNode<'LNode'> | undefined
	context: DataflowContext
}): Promise<{
	allocation: SpecifiedDataflow['specification']['allocation']
	mappedIeds: SpecifiedDataflow['specification']['mappedIeds']
}> {
	const { holder, other, context } = params
	const mappedIeds = {
		holder: await iedOfMappedLNode({ lnode: holder, context }),
		other: other && (await iedOfMappedLNode({ lnode: other, context })),
	}
	return { allocation: allocationOf(mappedIeds), mappedIeds }
}

function allocationOf(
	mappedIeds: SpecifiedDataflow['specification']['mappedIeds'],
): SpecifiedDataflow['specification']['allocation'] {
	const { holder, other } = mappedIeds
	if (!holder || !other) return 'unallocated'
	return holder.id === other.id ? 'same-ied' : 'inter-ied'
}

/**
 * The IED holding the LN an LNode is mapped to: the LN its `lnUuid` names (a uuid naming nothing
 * leaves it unmapped), else the one its naming gives.
 */
async function iedOfMappedLNode(params: {
	lnode: SectionNode<'LNode'>
	context: DataflowContext
}): Promise<Scl.Ref<'IED'> | undefined> {
	const { lnode, context } = params
	const attributes = await context.query.any.getAttributes(lnode.record)
	const { iedOfLn, lnsByPath } = await context.iedSection()
	const lnUuid = attributes[LNODE_LN_UUID_ATTRIBUTE]
	if (lnUuid) {
		const ln = (await context.lnByUuid()).get(lnUuid)
		return ln ? iedOfLn.get(ln.id) : undefined
	}
	const path = buildMappedLNodePath(attributes)
	return path ? lnsByPath.get(path)?.ied : undefined
}
