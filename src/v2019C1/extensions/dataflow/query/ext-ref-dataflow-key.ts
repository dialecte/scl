import { EXT_REF_SIGNAL } from '../constants/ext-ref-state.constants'
import { resolveControlBlock } from './resolve-control-block'
import { resolveSignalLogicalNode } from './resolve-signal-logical-node'

import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'

/**
 * What ExtRefs of one dataflow share: the logical node holding them (another subscriber of the same
 * signal is another dataflow), the control block they name and the signal they name down to its
 * data object (the data attributes tell them apart). Both are read resolved (the IED an `@`
 * names is its own, a control block by its uuid or its names is the same one). `undefined` while
 * the ExtRef names no control block of the document or no complete signal.
 */
export async function extRefDataflowKey(params: {
	extRef: IedNode<'ExtRef'>
	context: DataflowContext
}): Promise<string | undefined> {
	const { extRef, context } = params
	const { record } = extRef
	const controlBlock = await resolveControlBlock({ extRef, context })
	const iedSection = await context.iedSection()
	const logicalNode = resolveSignalLogicalNode({ element: extRef, iedSection })
	const dataObject = readRawAttribute({ record, name: EXT_REF_SIGNAL.data })
	if (!extRef.ln || !controlBlock || !logicalNode || !dataObject) return undefined
	return [extRef.ln.id, controlBlock.record.id, logicalNode.record.id, dataObject].join('|')
}
