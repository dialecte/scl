import type { SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { SectionNode } from './section-node.types'

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
	const mapped = await context.mappedProcessLNodes()
	const mappedIeds = {
		holder: mapped.get(holder.record.id)?.ied,
		other: other && mapped.get(other.record.id)?.ied,
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
