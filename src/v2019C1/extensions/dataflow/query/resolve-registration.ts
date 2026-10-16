import { LOGICAL_DEVICE_TAGS, LOGICAL_NODE_TAGS } from '../constants/ied-section.constants'
import { REGISTRATION_PRECISION_ORDER } from '../constants/registration.constants'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'
import { ownIedName } from '@/v2019C1/extensions/reference/query/ied-tuple/own-ied-name'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { tuplePairApplies } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-applies'
import { tupleTargetKind } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-target-kind'

import type { Registration } from '../dataflow.types'
import type { ControlBlockNode, IedNode } from './ied-section.types'
import type { Subscriber } from './resolve-registration.types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The entry of the subscriber (the IED holding the ExtRef) on a control block: the `IEDName` or
 * `ClientLN` registering it, the most precise one when several do. It names the subscriber's logical
 * node (`ln`), its logical device (`ld`), or only its IED (`ied`). `undefined` when the control block
 * names the subscriber nowhere.
 */
export function resolveRegistration(params: {
	controlBlock: ControlBlockNode
	extRef: IedNode<'ExtRef'>
}): Registration | undefined {
	const { controlBlock, extRef } = params
	const subscriber = {
		ied: ownIedName({ ancestry: extRef.ancestry }),
		logicalDevice: addressOfNearest({
			ancestry: extRef.ancestry,
			tagNames: LOGICAL_DEVICE_TAGS,
		}),
		logicalNode: addressOfNearest({
			ancestry: extRef.ancestry,
			tagNames: LOGICAL_NODE_TAGS,
		}),
	}

	const registrations = controlBlock.registrations.flatMap((registration) => {
		const names = precisionOf({ registration, subscriber })
		return names ? [{ element: registration.ref as Registration['element'], names }] : []
	})
	return registrations.sort(
		(first, second) =>
			REGISTRATION_PRECISION_ORDER.indexOf(first.names) -
			REGISTRATION_PRECISION_ORDER.indexOf(second.names),
	)[0]
}

/** How precisely a registration names the subscriber, by the best of its pairs; `undefined` when it names another. */
function precisionOf(params: {
	registration: IedNode<'IEDName' | 'ClientLN'>
	subscriber: Subscriber
}): Registration['names'] | undefined {
	const { registration, subscriber } = params
	const { record, ancestry } = registration
	const pairs: readonly TupleReferencePair[] =
		TUPLE_REFERENCE_PAIRS[record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? []
	const named = pairs.flatMap((pair): Registration['names'][] => {
		const kind = tupleTargetKind(pair.tuple)
		const address = referrerTupleAddress({ pair, record, ancestry })
		if (address !== undefined && kind === 'ln' && address === subscriber.logicalNode) return ['ln']
		if (address !== undefined && kind === 'ld' && address === subscriber.logicalDevice)
			return ['ld']
		const namesIed =
			kind === 'ap' &&
			tuplePairApplies({ record, pair }) &&
			iedNameOf({ role: pair.tuple.ied, record, ancestry }) === subscriber.ied
		return namesIed ? ['ied'] : []
	})
	return REGISTRATION_PRECISION_ORDER.find((names) => named.includes(names))
}

/** The tuple address of the nearest ancestor of one of `tagNames`. */
function addressOfNearest(params: {
	ancestry: readonly AnyRawRecord[]
	tagNames: readonly string[]
}): string | undefined {
	const { ancestry, tagNames } = params
	const index = ancestry.findLastIndex((record) => tagNames.includes(record.tagName))
	if (index === -1) return undefined
	return targetTupleAddress({ record: ancestry[index], ancestry: ancestry.slice(0, index) })
}
