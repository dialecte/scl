import {
	EXT_CTRL_LOGICAL_NODE_PAIR,
	EXT_REF_LOGICAL_NODE_PAIR,
} from '../constants/ext-ref-state.constants'

import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'

import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'

/**
 * The logical node the signal of an ExtRef / ExtCtrl names: the one its uuid names (the uuid wins,
 * and a uuid naming nothing leaves it unresolved), else the one its names name (the IED an `@` names
 * is the element's own). `undefined` while it names none, or the one it names is not in the document.
 */
export async function resolveSignalLogicalNode(params: {
	element: IedNode<'ExtRef' | 'ExtCtrl'>
	context: DataflowContext
}): Promise<IedNode<'LN' | 'LN0'> | undefined> {
	const { element, context } = params
	const { record, ancestry } = element
	const iedSection = await context.iedSection()
	const pair = record.tagName === 'ExtRef' ? EXT_REF_LOGICAL_NODE_PAIR : EXT_CTRL_LOGICAL_NODE_PAIR

	const uuid = await context.query.any.getAttribute(record, { name: pair.attribute.uuid })
	if (uuid) return iedSection.lnsByUuid.get(uuid)

	const address = referrerTupleAddress({ pair, record, ancestry })
	return address === undefined ? undefined : iedSection.lnsByAddress.get(address)
}
