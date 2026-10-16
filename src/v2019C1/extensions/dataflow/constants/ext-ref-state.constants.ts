import { EXT_REF_CONTROL_BLOCK_PAIR } from './control-blocks.constants'

import { invariant } from '@dialecte/core/utils'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { TUPLE_ROLES } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { isLogicalNodePair } from '@/v2019C1/extensions/reference/query/ied-tuple/is-logical-node-pair'
import { tuplePairTargeting } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-targeting'

import type {
	ControlBlockAttributes,
	LaterBindingAttributes,
	SignalAttributes,
} from '../dataflow.types'
import type { Scl } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { LogicalNodeTuplePair } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'

// The attributes the states of an ExtRef / ExtCtrl read, taken from the tuple references: the pair
// of a tag naming a logical node gives the attributes of the signal's address, the pair naming a
// control block gives its attributes and the services that have one.

export const EXT_REF_LOGICAL_NODE_PAIR = logicalNodePairOf(TUPLE_REFERENCE_PAIRS.ExtRef)
export const EXT_CTRL_LOGICAL_NODE_PAIR = logicalNodePairOf(TUPLE_REFERENCE_PAIRS.ExtCtrl)

function logicalNodePairOf(pairs: readonly TupleReferencePair[]): LogicalNodeTuplePair {
	const pair = tuplePairTargeting({ pairs, kind: 'ln' })
	invariant(pair && isLogicalNodePair(pair), {
		key: 'ASSERTION_FAILED',
		detail: 'an ExtRef and an ExtCtrl name the logical node of their signal',
	})
	return pair
}

/**
 * The data a signal names: it is not a role of the tuple (it names data, not an element), so these
 * are the signal attributes written here.
 */
const DATA_OBJECT_ATTRIBUTE = 'doName' satisfies Scl.AttributesOf<'ExtRef'> &
	Scl.AttributesOf<'ExtCtrl'>
const DATA_ATTRIBUTE_ATTRIBUTE = 'daName' satisfies Scl.AttributesOf<'ExtRef'>

/**
 * The attribute naming where an ExtRef / ExtCtrl lands in the receiving device. It is not a
 * reference attribute, so it is the other attribute written here.
 */
export const INTERNAL_ADDRESS_ATTRIBUTE = 'intAddr' satisfies Scl.AttributesOf<'ExtRef'> &
	Scl.AttributesOf<'ExtCtrl'>

/**
 * How an ExtRef names its signal: its logical node by uuid, or by its IED, logical device and logical
 * node class (the prefix and the instance may be left out), and its data object. `written` adds the
 * left-out parts and the data attribute: every attribute a later-binding ExtRef leaves out.
 */
export const EXT_REF_SIGNAL: SignalAttributes = signalOf({
	pair: EXT_REF_LOGICAL_NODE_PAIR,
	dataAttributes: [DATA_OBJECT_ATTRIBUTE, DATA_ATTRIBUTE_ATTRIBUTE],
})

/** How an ExtCtrl names its signal, like an ExtRef; it has no data attribute. */
export const EXT_CTRL_SIGNAL: SignalAttributes = signalOf({
	pair: EXT_CTRL_LOGICAL_NODE_PAIR,
	dataAttributes: [DATA_OBJECT_ATTRIBUTE],
})

function signalOf(params: {
	pair: LogicalNodeTuplePair
	dataAttributes: readonly string[]
}): SignalAttributes {
	const { pair, dataAttributes } = params
	const { tuple } = pair
	return {
		uuid: pair.attribute.uuid,
		names: [tuple.ied.attribute, tuple.lDevice, tuple.lnClass],
		data: DATA_OBJECT_ATTRIBUTE,
		written: [pair.attribute.uuid, ...tupleAttributesOf(pair), ...dataAttributes],
	}
}

/** How an ExtRef names the control block publishing its signal, and which services have one. */
export const EXT_REF_CONTROL_BLOCK: ControlBlockAttributes = {
	names: [EXT_REF_CONTROL_BLOCK_PAIR.attribute.uuid, EXT_REF_CONTROL_BLOCK_PAIR.tuple.controlBlock],
	serviceAttribute: EXT_REF_CONTROL_BLOCK_PAIR.targetByAttribute.attribute,
	servicesWithControlBlock: new Set(Object.keys(EXT_REF_CONTROL_BLOCK_PAIR.targetByAttribute.tags)),
}

/**
 * The data object an element expects, set beside the internal address of a later-binding element.
 * It is not a reference attribute either.
 */
const EXPECTED_DATA_OBJECT_ATTRIBUTE = 'pDO' satisfies Scl.AttributesOf<'ExtRef'> &
	Scl.AttributesOf<'ExtCtrl'>

/**
 * The later-binding shape of an ExtRef: the internal address and the expected data object, none of
 * its signal, nor its service, nor the attributes of its control block (its uuid, and the names the
 * control block is addressed by).
 */
export const EXT_REF_LATER_BINDING: LaterBindingAttributes = {
	required: [INTERNAL_ADDRESS_ATTRIBUTE, EXPECTED_DATA_OBJECT_ATTRIBUTE],
	forbidden: [
		...EXT_REF_SIGNAL.written,
		EXT_REF_CONTROL_BLOCK.serviceAttribute,
		EXT_REF_CONTROL_BLOCK_PAIR.attribute.uuid,
		...tupleAttributesOf(EXT_REF_CONTROL_BLOCK_PAIR),
	],
}

/**
 * The later-binding shape of an ExtCtrl: the internal address, nothing of its signal (the expected
 * data object is optional, unlike an ExtRef's).
 */
export const EXT_CTRL_LATER_BINDING: LaterBindingAttributes = {
	required: [INTERNAL_ADDRESS_ATTRIBUTE],
	forbidden: EXT_CTRL_SIGNAL.written,
}

/** The attributes a tuple reference addresses its target by: its IED and every part of the address it names. */
function tupleAttributesOf(pair: TupleReferencePair): string[] {
	const { ied } = pair.tuple
	return [
		...('attribute' in ied ? [ied.attribute] : []),
		...TUPLE_ROLES.flatMap((role) => pair.tuple[role] ?? []),
	]
}
