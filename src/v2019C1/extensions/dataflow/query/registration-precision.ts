import {
	REGISTRATION_ACCESS_POINT_ATTRIBUTE,
	REGISTRATION_PRECISION_ORDER,
} from '../constants/registration.constants'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { logicalNodeName } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { tuplePairApplies } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-applies'
import { tupleRoleValue } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-role-value'
import { tupleTargetKind } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-target-kind'

import type { Registration } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { IedNode } from './ied-section.types'
import type { Subscriber } from './resolve-registration.types'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'

/**
 * How precisely a registration (an `IEDName` or a `ClientLN`) names its subscriber: its logical node
 * (`ln`), its logical device (`ld`), or an access point of its IED (`ap`), by the most precise of
 * its tuple references. A reference names the subscriber by its uuid when it carries one (the
 * uuid wins), else by its names. Its `apRef` names an access point of the IED the registration
 * names; it is a matching key only for a client logical node held directly by an access point, and
 * an `apUuid` matches any access point of that IED. With a `subscriber`, only what names that
 * subscriber counts (`undefined` when the registration names another); without one, whatever the
 * registration names.
 */
export async function registrationPrecision(params: {
	context: DataflowContext
	registration: IedNode<'IEDName' | 'ClientLN'>
	subscriber?: Subscriber
}): Promise<Registration['names'] | undefined> {
	const { context, registration, subscriber } = params
	const { record } = registration
	const pairs: readonly TupleReferencePair[] =
		TUPLE_REFERENCE_PAIRS[record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? []
	const named: Registration['names'][] = []
	for (const pair of pairs) {
		const kind = tupleTargetKind(pair.tuple)
		const names = REGISTRATION_PRECISION_ORDER.find((precision) => precision === kind)
		if (
			names &&
			tuplePairApplies({ record, pair }) &&
			(await namesSubscriber({ context, pair, names, registration, subscriber }))
		) {
			named.push(names)
		}
	}
	return REGISTRATION_PRECISION_ORDER.find((names) => named.includes(names))
}

/** Whether one tuple reference of a registration names the subscriber, by its uuid, else by its names. */
async function namesSubscriber(params: {
	context: DataflowContext
	pair: TupleReferencePair
	names: Registration['names']
	registration: IedNode<'IEDName' | 'ClientLN'>
	subscriber: Subscriber | undefined
}): Promise<boolean> {
	const { context, pair, names, registration, subscriber } = params
	const { record, ancestry } = registration
	const uuid = await context.query.any.getAttribute(record, { name: pair.attribute.uuid })
	if (uuid) return subscriber === undefined || uuidNamesSubscriber({ uuid, names, subscriber })

	if (names === 'ap') {
		return isNamed({
			value: iedNameOf({ role: pair.tuple.ied, record, ancestry }),
			expected: subscriber?.ied,
			subscriber,
		})
	}
	if (names === 'ld') {
		return isNamed({
			value: referrerTupleAddress({ pair, record, ancestry }),
			expected: subscriber?.logicalDevice,
			subscriber,
		})
	}
	return subscriber?.accessPointLogicalNode
		? namesAccessPointLogicalNode({ context, pair, registration, subscriber })
		: isNamed({
				value: referrerTupleAddress({ pair, record, ancestry }),
				expected: subscriber?.logicalNode,
				subscriber,
			})
}

/**
 * Whether the uuid a registration carries names the subscriber: its logical device or logical node
 * exactly, and for an access point any access point of the subscriber's IED (the one a registration
 * names is not necessarily the one holding the ExtRef).
 */
function uuidNamesSubscriber(params: {
	uuid: string
	names: Registration['names']
	subscriber: Subscriber
}): boolean {
	const { uuid, names, subscriber } = params
	return names === 'ap' ? subscriber.accessPointUuids.has(uuid) : uuid === subscriber.uuids[names]
}

/**
 * Whether a registration names a logical node held directly by an access point: by its IED, its
 * access point and the logical node's name (its logical device is a placeholder there).
 */
async function namesAccessPointLogicalNode(params: {
	context: DataflowContext
	pair: TupleReferencePair
	registration: IedNode<'IEDName' | 'ClientLN'>
	subscriber: Subscriber
}): Promise<boolean> {
	const { context, pair, registration, subscriber } = params
	const { record, ancestry } = registration
	const { accessPointLogicalNode } = subscriber
	const lnClass = tupleRoleValue({ record, pair, role: 'lnClass' })
	if (!accessPointLogicalNode || !lnClass) return false
	return (
		iedNameOf({ role: pair.tuple.ied, record, ancestry }) === subscriber.ied &&
		(await context.query.any.getAttribute(record, {
			name: REGISTRATION_ACCESS_POINT_ATTRIBUTE,
		})) === accessPointLogicalNode.accessPoint &&
		logicalNodeName({
			prefix: tupleRoleValue({ record, pair, role: 'prefix' }),
			lnClass,
			inst: tupleRoleValue({ record, pair, role: 'lnInst' }),
		}) === accessPointLogicalNode.logicalNode
	)
}

/** Whether what a registration names is the subscriber's, or, with no subscriber, is named at all. */
function isNamed(params: {
	value: string | undefined
	expected: string | undefined
	subscriber: Subscriber | undefined
}): boolean {
	const { value, expected, subscriber } = params
	return value !== undefined && (subscriber === undefined || value === expected)
}
