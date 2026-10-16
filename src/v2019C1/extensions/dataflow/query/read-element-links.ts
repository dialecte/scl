import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
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
	const links: { attribute: string; found: boolean }[] = []
	for (const pair of pairs) {
		const attribute = pair.attribute.uuid
		switch (tupleTargetKind(pair.tuple)) {
			case 'ln': {
				const uuid = await context.query.any.getAttribute(element.record, { name: attribute })
				links.push({ attribute, found: logicalNodes.has(uuid) })
				break
			}
			case 'cb':
				links.push({ attribute, found: controlBlockFound })
				break
		}
	}
	return links
}
