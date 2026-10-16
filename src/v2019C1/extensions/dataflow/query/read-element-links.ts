import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'
import { tupleTargetKind } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-target-kind'

import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

/**
 * The uuids an ExtRef / ExtCtrl may carry (the logical node and, for an ExtRef, the control block it
 * names), each with whether the element it names was found in the document.
 */
export async function readElementLinks(params: {
	element: IedNode<'ExtRef' | 'ExtCtrl'>
	controlBlockFound: boolean
	context: DataflowContext
}): Promise<{ attribute: string; found: boolean }[]> {
	const { element, controlBlockFound, context } = params
	const logicalNodes = await context.lnByUuid()
	const pairs: readonly TupleReferencePair[] =
		TUPLE_REFERENCE_PAIRS[element.record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? []
	return pairs.flatMap((pair) => {
		const attribute = pair.attribute.uuid
		const uuid = readRawAttribute({ record: element.record, name: attribute })
		switch (tupleTargetKind(pair.tuple)) {
			case 'ln':
				return [{ attribute, found: uuid !== undefined && logicalNodes.has(uuid) }]
			case 'cb':
				return [{ attribute, found: controlBlockFound }]
			default:
				return []
		}
	})
}
