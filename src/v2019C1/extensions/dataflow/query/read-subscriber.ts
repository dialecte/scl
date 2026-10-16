import {
	ACCESS_POINT_TAGS,
	LOGICAL_DEVICE_TAGS,
	LOGICAL_NODE_TAGS,
} from '../constants/ied-section.constants'

import { logicalNodeName } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { ownIedName } from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import {
	targetTupleAddress,
	targetTupleParts,
} from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'

import type { IedNode, IedSection } from './ied-section.types'
import type { Subscriber } from './resolve-registration.types'
import type { AnyRawRecord } from '@dialecte/core'

/** What names an ExtRef, as the subscriber of a control block: its IED, access point, logical device and logical node. */
export function readSubscriber(params: {
	extRef: IedNode<'ExtRef'>
	iedSection: IedSection
}): Subscriber {
	const { extRef, iedSection } = params
	const { ancestry } = extRef
	const accessPoint = nearest({ ancestry, tagNames: ACCESS_POINT_TAGS })
	const logicalDevice = nearest({ ancestry, tagNames: LOGICAL_DEVICE_TAGS })
	const logicalNode = nearest({ ancestry, tagNames: LOGICAL_NODE_TAGS })
	return {
		ied: ownIedName({ ancestry }),
		logicalDevice: logicalDevice && addressOf({ record: logicalDevice, ancestry }),
		logicalNode: logicalNode && addressOf({ record: logicalNode, ancestry }),
		accessPointUuids: iedSection.accessPointUuidsByIed.get(extRef.ied.id) ?? new Set(),
		uuids: {
			ld: logicalDevice && iedSection.uuidById.get(logicalDevice.id),
			ln: logicalNode && iedSection.uuidById.get(logicalNode.id),
		},
		accessPointLogicalNode:
			accessPoint && logicalNode && !logicalDevice
				? accessPointLogicalNodeOf({ accessPoint, logicalNode, ancestry })
				: undefined,
	}
}

/** The names of an access point and of a logical node it holds directly. */
function accessPointLogicalNodeOf(params: {
	accessPoint: AnyRawRecord
	logicalNode: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): Subscriber['accessPointLogicalNode'] {
	const { accessPoint, logicalNode, ancestry } = params
	const accessPointParts = targetTupleParts({
		record: accessPoint,
		ancestry: ancestry.slice(0, ancestry.indexOf(accessPoint)),
	})
	const logicalNodeParts = targetTupleParts({
		record: logicalNode,
		ancestry: ancestry.slice(0, ancestry.indexOf(logicalNode)),
	})
	if (!logicalNodeParts?.lnClass) return undefined
	return {
		accessPoint: accessPointParts?.accessPoint,
		logicalNode: logicalNodeName({
			prefix: logicalNodeParts.prefix,
			lnClass: logicalNodeParts.lnClass,
			inst: logicalNodeParts.lnInst,
		}),
	}
}

/** The nearest ancestor of one of `tagNames`. */
function nearest(params: {
	ancestry: readonly AnyRawRecord[]
	tagNames: readonly string[]
}): AnyRawRecord | undefined {
	return params.ancestry.findLast((record) => params.tagNames.includes(record.tagName))
}

/** The tuple address of an ancestor, read from the records above it. */
function addressOf(params: {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): string | undefined {
	const { record, ancestry } = params
	return targetTupleAddress({ record, ancestry: ancestry.slice(0, ancestry.indexOf(record)) })
}
