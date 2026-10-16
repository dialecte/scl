import { EXT_REF_CONTROL_BLOCK_PAIR } from './control-blocks.constants'

import { invariant } from '@dialecte/core/utils'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { isLogicalNodePair } from '@/v2019C1/extensions/reference/query/ied-tuple/is-logical-node-pair'
import { tuplePairTargeting } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-targeting'

import type { ControlBlockAttributes, SignalAttributes } from '../dataflow.types'
import type { Scl } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { LogicalNodeTuplePair } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'

// The attributes the states of an ExtRef / ExtCtrl read, taken from the tuple references: the pair
// of a tag naming a logical node gives the attributes of the signal's address, the pair naming a
// control block gives its attributes and the services that have one.

const EXT_REF_LOGICAL_NODE_PAIR = logicalNodePairOf(TUPLE_REFERENCE_PAIRS.ExtRef)
const EXT_CTRL_LOGICAL_NODE_PAIR = logicalNodePairOf(TUPLE_REFERENCE_PAIRS.ExtCtrl)

function logicalNodePairOf(pairs: readonly TupleReferencePair[]): LogicalNodeTuplePair {
	const pair = tuplePairTargeting({ pairs, kind: 'ln' })
	invariant(pair && isLogicalNodePair(pair), {
		key: 'ASSERTION_FAILED',
		detail: 'an ExtRef and an ExtCtrl name the logical node of their signal',
	})
	return pair
}

/**
 * The data a signal names: it is not a role of the tuple (it names data, not an element), so it is
 * the one signal attribute written here.
 */
const DATA_OBJECT_ATTRIBUTE = 'doName' satisfies Scl.AttributesOf<'ExtRef'> &
	Scl.AttributesOf<'ExtCtrl'>

/**
 * The attribute naming where an ExtRef / ExtCtrl lands in the receiving device. It is not a
 * reference attribute, so it is the other attribute written here.
 */
export const INTERNAL_ADDRESS_ATTRIBUTE = 'intAddr' satisfies Scl.AttributesOf<'ExtRef'> &
	Scl.AttributesOf<'ExtCtrl'>

/**
 * How an ExtRef names its signal: its logical node by uuid, or by its IED, logical device and logical
 * node class (the prefix and the instance may be left out), and its data object.
 */
export const EXT_REF_SIGNAL: SignalAttributes = {
	uuid: EXT_REF_LOGICAL_NODE_PAIR.attribute.uuid,
	names: [
		EXT_REF_LOGICAL_NODE_PAIR.tuple.ied.attribute,
		EXT_REF_LOGICAL_NODE_PAIR.tuple.lDevice,
		EXT_REF_LOGICAL_NODE_PAIR.tuple.lnClass,
	],
	data: DATA_OBJECT_ATTRIBUTE,
}

/** How an ExtCtrl names its signal, like an ExtRef. */
export const EXT_CTRL_SIGNAL: SignalAttributes = {
	uuid: EXT_CTRL_LOGICAL_NODE_PAIR.attribute.uuid,
	names: [
		EXT_CTRL_LOGICAL_NODE_PAIR.tuple.ied.attribute,
		EXT_CTRL_LOGICAL_NODE_PAIR.tuple.lDevice,
		EXT_CTRL_LOGICAL_NODE_PAIR.tuple.lnClass,
	],
	data: DATA_OBJECT_ATTRIBUTE,
}

/** How an ExtRef names the control block publishing its signal, and which services have one. */
export const EXT_REF_CONTROL_BLOCK: ControlBlockAttributes = {
	names: [EXT_REF_CONTROL_BLOCK_PAIR.attribute.uuid, EXT_REF_CONTROL_BLOCK_PAIR.tuple.controlBlock],
	serviceAttribute: EXT_REF_CONTROL_BLOCK_PAIR.targetByAttribute.attribute,
	servicesWithControlBlock: new Set(Object.keys(EXT_REF_CONTROL_BLOCK_PAIR.targetByAttribute.tags)),
}
