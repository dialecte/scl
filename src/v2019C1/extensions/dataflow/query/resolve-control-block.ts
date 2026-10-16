import { EXT_REF_CONTROL_BLOCK_PAIR } from '../constants/control-blocks.constants'

import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetKey } from '@/v2019C1/extensions/reference/query/ied-tuple/target-key'
import { targetTagsOf } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tags-of'

import type { DataflowContext } from './dataflow-context.types'
import type { ControlBlockNode, IedNode } from './ied-section.types'

/**
 * The control block an ExtRef names: the one its uuid names, else the one its names name (its
 * service tells which kind). `undefined` while it names none, the one it names is not in the
 * document, or its names fit several control blocks of different kinds.
 */
export async function resolveControlBlock(params: {
	extRef: IedNode<'ExtRef'>
	context: DataflowContext
}): Promise<ControlBlockNode | undefined> {
	const { extRef, context } = params
	const { record, ancestry } = extRef
	const { controlBlocksByUuid, controlBlocksByAddress } = await context.iedSection()

	const uuid = await context.query.any.getAttribute(record, {
		name: EXT_REF_CONTROL_BLOCK_PAIR.attribute.uuid,
	})
	if (uuid) return controlBlocksByUuid.get(uuid)

	const address = referrerTupleAddress({ pair: EXT_REF_CONTROL_BLOCK_PAIR, record, ancestry })
	if (!address) return undefined
	const named = targetTagsOf({ pair: EXT_REF_CONTROL_BLOCK_PAIR, record }).flatMap((tagName) => {
		const controlBlock = controlBlocksByAddress.get(targetKey({ address, tagName }))
		return controlBlock ? [controlBlock] : []
	})
	return named.length === 1 ? named[0] : undefined
}
