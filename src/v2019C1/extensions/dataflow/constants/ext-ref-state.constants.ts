import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { ControlBlockAttributes, SignalAttributes } from '../dataflow.types'
import type { Scl } from '@/v2019C1/config'

// The attributes the states of an ExtRef / ExtCtrl read, taken from the tuple references: the pair
// of a tag naming a logical node gives the attributes of the signal's address, the pair naming a
// control block gives its attributes and the services that have one.

const EXT_REF_LOGICAL_NODE_PAIR = TUPLE_REFERENCE_PAIRS.ExtRef[0]
const EXT_REF_CONTROL_BLOCK_PAIR = TUPLE_REFERENCE_PAIRS.ExtRef[1]
const EXT_CTRL_LOGICAL_NODE_PAIR = TUPLE_REFERENCE_PAIRS.ExtCtrl[0]

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
