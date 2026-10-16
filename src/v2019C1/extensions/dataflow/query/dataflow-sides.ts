import {
	EXT_CTRL_LOGICAL_NODE_PAIR,
	EXT_REF_LOGICAL_NODE_PAIR,
} from '../constants/ext-ref-state.constants'
import { resolveSignalLogicalNode } from './resolve-signal-logical-node'

import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'

import type { Dataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { DataflowSides } from './dataflow-sides.types'
import type { Scl } from '@/v2019C1/config'

/**
 * The IEDs a dataflow runs between. The near side is the IED holding its ExtRef / ExtCtrl, else
 * the IED its holder LNode is mapped to. The far side is the IED holding the control block it
 * names, else the IED its ExtRef / ExtCtrl names as the owner of its signal, else the IED the other
 * LNode is mapped to.
 */
export async function dataflowSides(params: {
	dataflow: Dataflow
	context: DataflowContext
}): Promise<DataflowSides> {
	const { dataflow, context } = params
	const { implementation } = dataflow
	const mappedIeds = dataflow.kind === 'specified' ? dataflow.specification.mappedIeds : undefined
	return {
		near: implementation.ied ?? mappedIeds?.holder,
		far:
			implementation.publisher ??
			(await iedNamedByElement({ element: implementation.element, context })) ??
			mappedIeds?.other,
	}
}

/**
 * The IED the signal of an ExtRef / ExtCtrl names: the IED of the logical node it names (by uuid, else
 * by its names), else the IED its `iedName` names (`@`: the one holding the element), when it is in
 * the document.
 */
async function iedNamedByElement(params: {
	element: Scl.Ref<'ExtRef' | 'ExtCtrl'> | undefined
	context: DataflowContext
}): Promise<Scl.Ref<'IED'> | undefined> {
	const { element, context } = params
	const iedSection = await context.iedSection()
	const node = element && iedSection.implementations.get(element.id)
	if (!node) return undefined
	const logicalNode = await resolveSignalLogicalNode({ element: node, context })
	if (logicalNode) return logicalNode.ied
	const pair =
		node.record.tagName === 'ExtRef' ? EXT_REF_LOGICAL_NODE_PAIR : EXT_CTRL_LOGICAL_NODE_PAIR
	const name = iedNameOf({ role: pair.tuple.ied, record: node.record, ancestry: node.ancestry })
	return name === undefined ? undefined : iedSection.iedByName.get(name)
}
