import { CHILDREN } from '@/v2019C1/definition/constants.generated'
import { EXT_REF_CONTROL_BLOCK_PAIR } from '@/v2019C1/extensions/dataflow/constants/control-blocks.constants'
import { EXT_REF_SIGNAL } from '@/v2019C1/extensions/dataflow/constants/ext-ref-state.constants'
import { DISPOSABLE_REFERENCE_TAGS } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'

/** The records a closure reads: the IEDs, their IED section, and the connections of the communication section. */
export const CLOSURE_MODEL_TAGS = [
	'IED',
	'AccessPoint',
	'ServerAt',
	'Server',
	'LDevice',
	'LN0',
	'LN',
	'DataSet',
	'FCDA',
	'GSEControl',
	'SampledValueControl',
	'ReportControl',
	'RptEnabled',
	'IEDName',
	'ClientLN',
	'ConnectedAP',
	'GSE',
	'SMV',
] as const

/** The parents an interface keeps settings of: each keeps its children but texts, private content, references and frames. */
const SETTINGS_HOLDER_TAGS = [
	'Server',
	'GSEControl',
	'SampledValueControl',
	'ReportControl',
] as const

/** What a kept element never keeps for an interface: texts, private content, and the frames a closure cuts on its own. */
const NEVER_KEPT_WHOLE: ReadonlySet<string> = new Set(['Text', 'Private', 'LDevice'])

/**
 * What a kept element keeps with it whole, by its tag, derived from the definition: a server its authentication, a control
 * block its settings and its report enabling (whose report clients still go) — every child but texts, private content,
 * references (receivers, report clients, associations) and frames. A data set's members are kept by the control block
 * that sends it, member by member.
 */
export const KEPT_UNDER_INTERFACE: ReadonlyMap<string, ReadonlySet<string>> = new Map(
	SETTINGS_HOLDER_TAGS.map((tag) => [
		tag,
		new Set(
			(CHILDREN[tag] as readonly string[]).filter(
				(child) => !NEVER_KEPT_WHOLE.has(child) && !DISPOSABLE_REFERENCE_TAGS.has(child),
			),
		),
	]),
)

/** The control blocks an interface seed may name; a logical node seed is in `LOGICAL_NODE_SEED_TAGS`. */
export const CONTROL_BLOCK_SEED_TAGS: ReadonlySet<string> = new Set([
	'GSEControl',
	'SampledValueControl',
	'ReportControl',
])

/** The kept elements a closure cuts inside: the frames of the IED section and of a connection; any other is kept whole. */
export const CUT_INSIDE_TAGS: ReadonlySet<string> = new Set([
	'IED',
	'AccessPoint',
	'Server',
	'LDevice',
	'LN0',
	'LN',
	'DataSet',
	'GSEControl',
	'SampledValueControl',
	'ReportControl',
	'RptEnabled',
	'ConnectedAP',
])

/** The addresses of control blocks a connection holds, named by what they address: GSE, SMV. */
export const CONTROL_BLOCK_ADDRESS_TAGS: ReadonlySet<string> = new Set(['GSE', 'SMV'])

/** The logical nodes an interface seed may name (an input polling it names no control block). */
export const LOGICAL_NODE_SEED_TAGS: ReadonlySet<string> = new Set(['LN', 'LN0'])

/** The uuid companions an input or output names its source by: its control block's, then its logical node's. */
export const SENDER_UUID_ATTRIBUTES = [
	EXT_REF_CONTROL_BLOCK_PAIR.attribute.uuid,
	EXT_REF_SIGNAL.uuid,
] as const
