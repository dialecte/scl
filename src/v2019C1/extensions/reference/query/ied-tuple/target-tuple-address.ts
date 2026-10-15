import { TUPLE_TARGET_KINDS, TUPLE_TARGET_TAGS_BY_KIND } from './ied-tuple.constants'

import {
	getPathSegment,
	logicalNodeName,
} from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { TupleTargetParts } from './ied-tuple.types'
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
	const parts = targetTupleParts(params)
	if (!parts) return undefined
	const { kind, ied, lDevice, accessPoint, controlBlock } = parts
	switch (kind) {
		case 'ap':
			return accessPoint ? `ap:${ied}/${accessPoint}` : undefined
		case 'ld':
			return lDevice ? `ld:${ied}/${lDevice}` : undefined
		case 'ln': {
			const logicalNode = logicalNodeOf(parts)
			return lDevice && logicalNode ? `ln:${ied}/${lDevice}/${logicalNode}` : undefined
		}
		case 'cb': {
			const logicalNode = logicalNodeOf(parts)
			return lDevice && logicalNode && controlBlock
				? `cb:${ied}/${lDevice}/${logicalNode}.${controlBlock}`
				: undefined
		}
	}
}

/**
 * The parts of an IED-section element's address: its IED, and as its kind needs, its logical device,
 * the prefix / class / instance of its logical node (the one holding it for a control block), its
 * access point or control block name. `undefined` for an element no tuple names, or outside an IED.
 */
export function targetTupleParts(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): TupleTargetParts | undefined {
	const { record, ancestry } = params
	const kind = TUPLE_TARGET_KINDS.get(record.tagName)
	const iedRecord = nearest({ ancestry, tagNames: ['IED'] })
	const ied = iedRecord ? readRawAttribute({ record: iedRecord, name: 'name' }) : undefined
	if (!kind || !ied) return undefined

	const lDeviceRecord =
		kind === 'ld'
			? record
			: nearest({ ancestry, tagNames: TUPLE_TARGET_TAGS_BY_KIND.get('ld') ?? [] })
	const lDevice = lDeviceRecord ? getPathSegment(lDeviceRecord)?.segment : undefined
	switch (kind) {
		case 'ap':
			return { kind, ied, accessPoint: readRawAttribute({ record, name: 'name' }) }
		case 'ld':
			return { kind, ied, lDevice }
		case 'ln':
			return { kind, ied, lDevice, ...logicalNodePartsOf(record) }
		case 'cb': {
			const logicalNode = nearest({ ancestry, tagNames: TUPLE_TARGET_TAGS_BY_KIND.get('ln') ?? [] })
			return {
				kind,
				ied,
				lDevice,
				...(logicalNode ? logicalNodePartsOf(logicalNode) : {}),
				controlBlock: readRawAttribute({ record, name: 'name' }),
			}
		}
	}
}

function logicalNodePartsOf(
	record: AnyRawRecord,
): Pick<TupleTargetParts, 'prefix' | 'lnClass' | 'lnInst'> {
	return {
		prefix: readRawAttribute({ record, name: 'prefix' }),
		lnClass: readRawAttribute({ record, name: 'lnClass' }),
		lnInst: readRawAttribute({ record, name: 'inst' }),
	}
}

function logicalNodeOf(parts: TupleTargetParts): string | undefined {
	const { prefix, lnClass, lnInst } = parts
	return lnClass ? logicalNodeName({ prefix, lnClass, inst: lnInst }) : undefined
}

/** The nearest ancestor of one of `tagNames`. */
function nearest(params: {
	ancestry: readonly AnyRawRecord[]
	tagNames: readonly string[]
}): AnyRawRecord | undefined {
	return params.ancestry.findLast((record) => params.tagNames.includes(record.tagName))
}
