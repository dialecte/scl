import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
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
import { TUPLE_ROLES } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'

import type {
	ProcessFamilyPair,
	ProcessPairNotGrouped,
	ProcessReferenceFamily,
	ProcessReferenceFamilyRow,
	ReferencePolicy,
} from './reference-closure.types'
import type { ReferencePair } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.types'

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
export const REFERENCE_ACTIONS = ['keep', 'keep-listed', 'keep-names', 'reduce', 'remove'] as const

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

/**
 * The attributes an input names the control block publishing its signal by (its logical device, logical node and name):
 * they describe the actual incoming signal, not an expected one, and go with the uuids when its source IED is not in
 * the file.
 */
export const INPUT_CONTROL_BLOCK_NAME_ATTRIBUTES: readonly string[] = TUPLE_ROLES.flatMap(
	(role) => EXT_REF_CONTROL_BLOCK_PAIR.tuple[role] ?? [],
)

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

/**
 * A template of a part of a substation carrying the IEDs its logical nodes are tied to: references between them kept; an
 * input or output naming an IED it does not carry keeps its signal names and loses their uuids and the control block it
 * names (a signal expected from outside, bound again where the template is placed); receivers and report clients naming such an IED left out.
 */
export const SSD_REFERENCE_POLICY: ReferencePolicy = {
	input: { inside: 'keep', present: 'keep-names', absent: 'keep-names' },
	output: { inside: 'keep', present: 'keep-names', absent: 'keep-names' },
	'client-list': { inside: 'keep', present: 'remove', absent: 'remove' },
	association: { inside: 'keep', present: 'keep-listed', absent: 'keep-listed' },
	supervision: { inside: 'keep', present: 'keep-listed', absent: 'keep-listed' },
}

/** The kinds of process reference a copy reads. */
export const PROCESS_REFERENCE_FAMILY_NAMES = [
	'source-signal',
	'control-signal',
	'function-reference',
	'terminal-node',
] as const

/**
 * Each process family: the holder and the uuid attribute of its pair in the reference-pair registry, and the shape its
 * holder takes when the reference is dropped, each checked against the standard: an input or output specification left
 * open keeps its own content and loses its link (`reduce`); a function reference and a terminal need what they name and
 * go whole (`remove`).
 */
export const PROCESS_REFERENCE_FAMILIES = {
	'source-signal': { holder: 'SourceRef', uuidAttribute: 'sourceLNodeUuid', drop: 'reduce' },
	'control-signal': { holder: 'ControlRef', uuidAttribute: 'controlledLNodeUuid', drop: 'reduce' },
	'function-reference': { holder: 'FunctionRef', uuidAttribute: 'functionUuid', drop: 'remove' },
	'terminal-node': { holder: 'Terminal', uuidAttribute: 'cNodeUuid', drop: 'remove' },
} as const satisfies Readonly<Record<ProcessReferenceFamily, ProcessReferenceFamilyRow>>

/** Why a registry pair below what a copy places is no process family (`PROCESS_PAIRS_NOT_GROUPED`). */
const NOT_GROUPED_BECAUSE = {
	SHARED_ROLE_REFERENCE:
		'an application role naming a shared element: reused by the copy, never one of its outside references',
	SATELLITE_PAIR:
		'a behaviour or variable pair: kept as written, the satellite families come later',
	IMPLEMENTATION_LINK: 'a link to the implementing IED: the unbind of the copy clears it',
	PROCESS_RESOURCE_LINK:
		'a process resource reached through the parent hierarchy: follow-up E1d (copy: process-resource references)',
	IMPLEMENTATION_MAPPING:
		'the mapping of a data specification to the implementing logical node: the unbind of the copy clears it',
	BELOW_FUNCTION_REFERENCE:
		'below a FunctionRef: follows its function-reference row (written with it when kept, gone with it when dropped)',
	PROCESS_RESOURCE_BINDING:
		'the mandatory binding of a process resource to a process element: kept as written, follow-up E1d',
	APPLICATION_ALLOCATION_ROLE:
		'an application naming the allocation role it is allocated to: a shared element, reused by the copy',
	APPLICATION_VARIANT: 'a variant of the application itself: inside the copy',
	MANDATORY_ECHO: 'its reference is mandatory: a drop shape of its own, not grouped yet',
	POWER_SYSTEM_RELATION:
		'a power system relation of the topology: kept as written, not grouped yet',
} as const

/**
 * The registry pairs a holder below a Function, a SubFunction or an Application may hold that no process family groups,
 * each with why: a copy writes them as they are.
 */
export const PROCESS_PAIRS_NOT_GROUPED: readonly ProcessPairNotGrouped[] = [
	{
		holder: 'AllocationRoleRef',
		uuidAttribute: 'allocationRoleUuid',
		reason: NOT_GROUPED_BECAUSE.APPLICATION_ALLOCATION_ROLE,
	},
	{
		holder: 'BehaviorDescriptionRef',
		uuidAttribute: 'behaviorDescriptionUuid',
		reason: NOT_GROUPED_BECAUSE.SHARED_ROLE_REFERENCE,
	},
	{
		holder: 'BehaviorReference',
		uuidAttribute: 'behaviorUuid',
		reason: NOT_GROUPED_BECAUSE.SATELLITE_PAIR,
	},
	{
		holder: 'ControlRef',
		uuidAttribute: 'extCtrlUuid',
		reason: NOT_GROUPED_BECAUSE.IMPLEMENTATION_LINK,
	},
	{
		holder: 'ControlRef',
		uuidAttribute: 'resourceUuid',
		reason: NOT_GROUPED_BECAUSE.PROCESS_RESOURCE_LINK,
	},
	{
		holder: 'ControllingLNode',
		uuidAttribute: 'resourceUuid',
		reason: NOT_GROUPED_BECAUSE.PROCESS_RESOURCE_LINK,
	},
	{
		holder: 'DAS',
		uuidAttribute: 'mappedLnUuid',
		reason: NOT_GROUPED_BECAUSE.IMPLEMENTATION_MAPPING,
	},
	{
		holder: 'DOS',
		uuidAttribute: 'mappedLnUuid',
		reason: NOT_GROUPED_BECAUSE.IMPLEMENTATION_MAPPING,
	},
	{
		holder: 'FunctionCategoryRef',
		uuidAttribute: 'functionCategoryUuid',
		reason: NOT_GROUPED_BECAUSE.SHARED_ROLE_REFERENCE,
	},
	{
		holder: 'FunctionalVariantRef',
		uuidAttribute: 'functionalVariantUuid',
		reason: NOT_GROUPED_BECAUSE.APPLICATION_VARIANT,
	},
	{ holder: 'InputVar', uuidAttribute: 'inputUuid', reason: NOT_GROUPED_BECAUSE.SATELLITE_PAIR },
	{ holder: 'InputVar', uuidAttribute: 'lnodeUuid', reason: NOT_GROUPED_BECAUSE.SATELLITE_PAIR },
	{
		holder: 'LNodeDataRef',
		uuidAttribute: 'lnodeUuid',
		reason: NOT_GROUPED_BECAUSE.BELOW_FUNCTION_REFERENCE,
	},
	{
		holder: 'LNodeInputRef',
		uuidAttribute: 'sourceRefUuid',
		reason: NOT_GROUPED_BECAUSE.BELOW_FUNCTION_REFERENCE,
	},
	{
		holder: 'LNodeOutputRef',
		uuidAttribute: 'controlRefUuid',
		reason: NOT_GROUPED_BECAUSE.BELOW_FUNCTION_REFERENCE,
	},
	{ holder: 'OutputVar', uuidAttribute: 'lnodeUuid', reason: NOT_GROUPED_BECAUSE.SATELLITE_PAIR },
	{ holder: 'OutputVar', uuidAttribute: 'outputUuid', reason: NOT_GROUPED_BECAUSE.SATELLITE_PAIR },
	{
		holder: 'PowerSystemRelation',
		uuidAttribute: 'relationUuid',
		reason: NOT_GROUPED_BECAUSE.POWER_SYSTEM_RELATION,
	},
	{
		holder: 'PowerSystemRelationRef',
		uuidAttribute: 'powerSystemRelationUuid',
		reason: NOT_GROUPED_BECAUSE.SHARED_ROLE_REFERENCE,
	},
	{
		holder: 'ProcessEcho',
		uuidAttribute: 'sourceLNodeUuid',
		reason: NOT_GROUPED_BECAUSE.MANDATORY_ECHO,
	},
	{
		holder: 'ProcessResourceRef',
		uuidAttribute: 'processResourceUuid',
		reason: NOT_GROUPED_BECAUSE.SHARED_ROLE_REFERENCE,
	},
	{
		holder: 'Resource',
		uuidAttribute: 'sourceUuid',
		reason: NOT_GROUPED_BECAUSE.PROCESS_RESOURCE_BINDING,
	},
	{
		holder: 'SDS',
		uuidAttribute: 'mappedLnUuid',
		reason: NOT_GROUPED_BECAUSE.IMPLEMENTATION_MAPPING,
	},
	{
		holder: 'SourceRef',
		uuidAttribute: 'extRefUuid',
		reason: NOT_GROUPED_BECAUSE.IMPLEMENTATION_LINK,
	},
	{
		holder: 'SourceRef',
		uuidAttribute: 'resourceUuid',
		reason: NOT_GROUPED_BECAUSE.PROCESS_RESOURCE_LINK,
	},
	{
		holder: 'SubscriberLNode',
		uuidAttribute: 'resourceUuid',
		reason: NOT_GROUPED_BECAUSE.PROCESS_RESOURCE_LINK,
	},
	{
		holder: 'VariableApplyTo',
		uuidAttribute: 'elementUuid',
		reason: NOT_GROUPED_BECAUSE.SATELLITE_PAIR,
	},
	{
		holder: 'VariableRef',
		uuidAttribute: 'variableUuid',
		reason: NOT_GROUPED_BECAUSE.SHARED_ROLE_REFERENCE,
	},
]

/** Each process family by its holder's tag, with its registry pair: read once, as a record of that tag is met. */
export const PROCESS_FAMILY_PAIRS: ReadonlyMap<string, readonly ProcessFamilyPair[]> = new Map(
	Object.entries(PROCESS_REFERENCE_FAMILIES).map(function familyPairOf([family, row]) {
		const pairs: readonly ReferencePair[] = UUID_REFERENCE_PAIRS[row.holder]
		const pair = pairs.find((candidate) => candidate.attribute.uuid === row.uuidAttribute)
		return [row.holder, pair ? [{ family: family as ProcessReferenceFamily, pair }] : []] as const
	}),
)
