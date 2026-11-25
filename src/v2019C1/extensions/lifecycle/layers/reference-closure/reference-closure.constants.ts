import { EXT_REF_CONTROL_BLOCK_PAIR } from '@/v2019C1/extensions/dataflow/constants/control-blocks.constants'
import {
	EXT_CTRL_LATER_BINDING,
	EXT_CTRL_SIGNAL,
	EXT_REF_LATER_BINDING,
	EXT_REF_SIGNAL,
} from '@/v2019C1/extensions/dataflow/constants/ext-ref-state.constants'
import {
	IED_RELATIVE_REFERENCE_PREFIX,
	SUPERVISION_KINDS,
	SUPERVISION_REFERENCE_ATTRIBUTE,
} from '@/v2019C1/extensions/dataflow/constants/supervision.constants'

import type { ReferencePolicy } from './reference-closure.types'

/** Where a reference's target is. */
export const REFERENCE_CLASSES = ['inside', 'present', 'absent'] as const

/** The kinds of reference a cut reads. */
export const REFERENCE_FAMILIES = [
	'input',
	'output',
	'client-list',
	'association',
	'supervision',
] as const

/** What a cut may do with a reference. */
export const REFERENCE_ACTIONS = ['keep', 'keep-listed', 'reduce', 'remove'] as const

/** The attributes the reduction of an input removes: its source, its control block and their uuids, its service type. */
export const INPUT_SOURCE_ATTRIBUTES: readonly string[] = EXT_REF_LATER_BINDING.forbidden

/** The attributes the reduction of an output removes: the signal it controls and its uuid. */
export const OUTPUT_SOURCE_ATTRIBUTES: readonly string[] = EXT_CTRL_LATER_BINDING.forbidden

/** What an input written without its source still needs: its description, and the later binding's required attributes. */
export const INPUT_LATER_BINDING_NEEDS: readonly string[] = [
	'desc',
	...EXT_REF_LATER_BINDING.required,
]

/** The uuid attributes an input names its source by: its logical node's and its control block's. */
export const INPUT_UUID_ATTRIBUTES: readonly string[] = [
	EXT_REF_SIGNAL.uuid,
	EXT_REF_CONTROL_BLOCK_PAIR.attribute.uuid,
]

/** The uuid attribute an output names the logical node it controls by. */
export const OUTPUT_UUID_ATTRIBUTES: readonly string[] = [EXT_CTRL_SIGNAL.uuid]

/** The elements an input's or an output's uuid names: logical nodes and control blocks. */
export const UUID_TARGET_TAGS = [
	'LN',
	'LN0',
	'GSEControl',
	'SampledValueControl',
	'ReportControl',
] as const

/** The attribute naming the internal address an input or output lands on in its device. */
export const INTERNAL_ADDRESS = 'intAddr'

/** What a reference inside an IED starts with in place of the IED's name. */
export const IED_RELATIVE_PREFIX = IED_RELATIVE_REFERENCE_PREFIX

/** The supervising logical node classes, their data object holding the reference, and its data attribute. */
export const SUPERVISIONS = {
	kinds: SUPERVISION_KINDS,
	attribute: SUPERVISION_REFERENCE_ATTRIBUTE,
} as const

/** What the families hold, by tag: the elements a cut reads under each root. */
export const REFERENCE_HOLDER_TAGS = [
	'Inputs',
	'ExtRef',
	'Outputs',
	'ExtCtrl',
	'IEDName',
	'ClientLN',
	'Association',
	'KDC',
	'LN',
	'LN0',
	'GSEControl',
	'SampledValueControl',
	'ReportControl',
] as const

/** A file of one real IED: references it holds are kept, any other reduced, receivers and clients kept and listed. */
const CID_KEEP: ReferencePolicy = {
	input: { inside: 'keep', present: 'reduce', absent: 'reduce' },
	output: { inside: 'keep', present: 'reduce', absent: 'reduce' },
	'client-list': { inside: 'keep', present: 'keep-listed', absent: 'keep-listed' },
	association: { inside: 'keep', present: 'keep-listed', absent: 'keep-listed' },
	supervision: { inside: 'keep', present: 'keep-listed', absent: 'keep-listed' },
}

/** The policies of a real IED's file, by its `clientRefs`: receivers and clients naming an absent IED kept, or left out. */
export const CID_REFERENCE_POLICIES: Readonly<Record<'keep' | 'cleanAbsent', ReferencePolicy>> = {
	keep: CID_KEEP,
	cleanAbsent: {
		...CID_KEEP,
		'client-list': { inside: 'keep', present: 'remove', absent: 'remove' },
	},
}
