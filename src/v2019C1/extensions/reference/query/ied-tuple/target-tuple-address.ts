import { TUPLE_TARGET_KINDS } from './ied-tuple.constants'

import { getPathSegment } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { AnyRawRecord } from '@dialecte/core'

/**
 * The address an IED-section element is named by in a tuple reference, read from the element and its
 * ancestors (outermost first): `ln:` a logical node, `ld:` a logical device, `ap:` an access point,
 * `cb:` a control block, named within its logical node. `undefined` for any other element, or one
 * outside an IED.
 */
export function targetTupleAddress(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): string | undefined {
	const { record, ancestry } = params
	const kind = TUPLE_TARGET_KINDS.get(record.tagName)
	const ied = segmentOf({ ancestry, tagNames: ['IED'] })
	if (!kind || !ied) return undefined

	switch (kind) {
		case 'ap': {
			const name = readRawAttribute({ record, name: 'name' })
			return name ? `ap:${ied}/${name}` : undefined
		}
		case 'ld': {
			const lDevice = getPathSegment(record)?.segment
			return lDevice ? `ld:${ied}/${lDevice}` : undefined
		}
		case 'ln': {
			const lDevice = segmentOf({ ancestry, tagNames: ['LDevice'] })
			const logicalNode = getPathSegment(record)?.segment
			return lDevice && logicalNode ? `ln:${ied}/${lDevice}/${logicalNode}` : undefined
		}
		case 'cb': {
			const lDevice = segmentOf({ ancestry, tagNames: ['LDevice'] })
			const logicalNode = segmentOf({ ancestry, tagNames: ['LN', 'LN0'] })
			const name = readRawAttribute({ record, name: 'name' })
			return lDevice && logicalNode && name
				? `cb:${ied}/${lDevice}/${logicalNode}.${name}`
				: undefined
		}
	}
}

/** The path segment of the nearest ancestor of one of `tagNames`. */
function segmentOf(params: {
	ancestry: readonly AnyRawRecord[]
	tagNames: readonly string[]
}): string | undefined {
	const ancestor = params.ancestry.findLast((record) => params.tagNames.includes(record.tagName))
	return ancestor ? getPathSegment(ancestor)?.segment : undefined
}
