/**
 * Complete mapping of elements that have path/name -> UUID reference pairs.
 *
 * Dialecte-wide source of truth for reference edges (shared, not owned by any
 * single extension).
 *
 * Each entry maps an element tag to its reference attribute pairs where:
 * - `path`: the attribute holding a pathname or name reference
 * - `uuid`: the corresponding UUID attribute that identifies the same target
 * - `target`: the element tag(s) the UUID resolves to
 * - `companions`: attributes that must/may be set when the UUID is used
 * - `scope`: `'function'` when the path is relative to the target's Function (`FUNCTION_SCOPE_TAGS`),
 *   the Function left out: the references of a signal role (`LNodeInputRef`, `LNodeOutputRef`,
 *   `LNodeDataRef`)
 */
import { ELEMENT_NAMES } from '@/v2019C1/definition/constants.generated'

import type { TupleReferencePairsShape } from './reference-pairs.types'

/**
 * The elements a function-scoped path (`scope: 'function'`) starts below: the nearest of them above
 * the target is its Function, never a SubFunction.
 */
export const FUNCTION_SCOPE_TAGS: ReadonlySet<string> = new Set(['Function', 'EqFunction'])

export const UUID_REFERENCE_PAIRS = {
	AllocationRoleRef: [
		{
			attribute: { path: 'allocationRole', uuid: 'allocationRoleUuid' },
			resolution: 'direct',
			target: ['AllocationRole'],
			companions: [],
		},
	],
	BehaviorDescriptionRef: [
		{
			attribute: { path: 'behaviorDescription', uuid: 'behaviorDescriptionUuid' },
			resolution: 'direct',
			target: ['BehaviorDescription'],
			companions: [],
		},
	],
	BehaviorReference: [
		{
			attribute: { path: 'behaviorReference', uuid: 'behaviorUuid' },
			resolution: 'direct',
			target: ['BehaviorDescription'],
			companions: [],
		},
	],
	ControllingLNode: [
		{
			attribute: { path: 'resourceName', uuid: 'resourceUuid' },
			resolution: 'ancestor-name',
			target: ['ProcessResource'],
			companions: [],
		},
	],
	ControlRef: [
		{
			attribute: { path: 'controlled', uuid: 'controlledLNodeUuid' },
			resolution: 'lnode',
			target: ['LNode'],
			companions: [{ name: 'controlledDoName', required: true }],
		},
		{
			attribute: { path: 'extCtrlAddr', uuid: 'extCtrlUuid' },
			resolution: 'ied-address',
			target: ['ExtCtrl'],
			companions: [],
		},
		{
			attribute: { path: 'resourceName', uuid: 'resourceUuid' },
			resolution: 'ancestor-name',
			target: ['ProcessResource'],
			companions: [],
		},
	],
	DAS: [
		{
			attribute: { path: 'mappedDaName', uuid: 'mappedLnUuid' },
			resolution: 'lnode',
			target: ['LN', 'LN0'],
			companions: [],
		},
	],
	DOS: [
		{
			attribute: { path: 'mappedDoName', uuid: 'mappedLnUuid' },
			resolution: 'lnode',
			target: ['LN', 'LN0'],
			companions: [],
		},
	],
	FunctionCategoryRef: [
		{
			attribute: { path: 'functionCategory', uuid: 'functionCategoryUuid' },
			resolution: 'direct',
			target: ['FunctionCategory', 'SubCategory'],
			companions: [],
		},
	],
	FunctionCatRef: [
		{
			attribute: { path: 'function', uuid: 'functionUuid' },
			resolution: 'direct',
			target: ['Function', 'SubFunction'],
			companions: [],
		},
	],
	FunctionRef: [
		{
			attribute: { path: 'function', uuid: 'functionUuid' },
			resolution: 'direct',
			target: ['Function', 'SubFunction', 'EqFunction', 'EqSubFunction'],
			companions: [],
		},
	],
	FunctionalVariantRef: [
		{
			attribute: { path: 'functionalVariant', uuid: 'functionalVariantUuid' },
			resolution: 'direct',
			target: ['FunctionalVariant', 'FunctionalSubVariant'],
			companions: [],
		},
	],
	InputVar: [
		{
			attribute: { path: 'dataName', uuid: 'lnodeUuid' },
			resolution: 'behavior-description',
			target: ['LNode'],
			companions: [
				{ name: 'doName', required: true },
				{ name: 'daName', required: false },
			],
		},
		{
			attribute: { path: 'inputName', uuid: 'inputUuid' },
			resolution: 'behavior-description',
			target: ['SourceRef'],
			companions: [],
		},
	],
	LNodeDataRef: [
		{
			attribute: { path: 'data', uuid: 'lnodeUuid' },
			resolution: 'lnode',
			scope: 'function',
			target: ['LNode'],
			companions: [
				{ name: 'doName', required: true },
				{ name: 'daName', required: false },
			],
		},
	],
	LNodeInputRef: [
		{
			attribute: { path: 'sourceRef', uuid: 'sourceRefUuid' },
			resolution: 'direct',
			scope: 'function',
			target: ['SourceRef'],
			companions: [],
		},
	],
	LNodeOutputRef: [
		{
			attribute: { path: 'controlRef', uuid: 'controlRefUuid' },
			resolution: 'direct',
			scope: 'function',
			target: ['ControlRef'],
			companions: [],
		},
	],
	NeutralPoint: [
		{
			attribute: { path: 'connectivityNode', uuid: 'cNodeUuid' },
			resolution: 'direct',
			target: ['ConnectivityNode'],
			companions: [],
		},
	],
	OutputVar: [
		{
			attribute: { path: 'dataName', uuid: 'lnodeUuid' },
			resolution: 'behavior-description',
			target: ['LNode'],
			companions: [
				{ name: 'doName', required: true },
				{ name: 'daName', required: false },
			],
		},
		{
			attribute: { path: 'outputName', uuid: 'outputUuid' },
			resolution: 'behavior-description',
			target: ['ControlRef'],
			companions: [],
		},
	],
	PowerSystemRelation: [
		{
			attribute: { path: 'relation', uuid: 'relationUuid' },
			resolution: 'direct',
			target: [
				'ConductingEquipment',
				'PowerTransformer',
				'TransformerWinding',
				'GeneralEquipment',
				'SubEquipment',
			],
			companions: [],
		},
	],
	PowerSystemRelationRef: [
		{
			attribute: { path: 'powerSystemRelation', uuid: 'powerSystemRelationUuid' },
			resolution: 'direct',
			target: ['PowerSystemRelation'],
			companions: [],
		},
	],
	ProcessEcho: [
		{
			attribute: { path: 'source', uuid: 'sourceLNodeUuid' },
			resolution: 'lnode',
			target: ['LNode'],
			companions: [
				{ name: 'sourceDoName', required: true },
				{ name: 'sourceDaName', required: false },
			],
		},
	],
	ProcessResourceRef: [
		{
			attribute: { path: 'processResource', uuid: 'processResourceUuid' },
			resolution: 'direct',
			target: ['ProcessResource'],
			companions: [],
		},
	],
	ProjectProcessReference: [
		{
			attribute: { path: 'processReference', uuid: 'processUuid' },
			resolution: 'direct',
			target: ['Process'],
			companions: [],
		},
	],
	Resource: [
		{
			attribute: { path: 'source', uuid: 'sourceUuid' },
			resolution: 'direct',
			target: [
				'Substation',
				'VoltageLevel',
				'Bay',
				'ConductingEquipment',
				'PowerTransformer',
				'TransformerWinding',
				'GeneralEquipment',
				'Function',
				'SubFunction',
				'EqFunction',
				'EqSubFunction',
				'LNode',
			],
			companions: [],
		},
	],
	SDS: [
		{
			attribute: { path: 'mappedDoName', uuid: 'mappedLnUuid' },
			resolution: 'lnode',
			target: ['LN', 'LN0'],
			companions: [],
		},
	],
	SourceRef: [
		{
			attribute: { path: 'source', uuid: 'sourceLNodeUuid' },
			resolution: 'lnode',
			target: ['LNode'],
			companions: [
				{ name: 'sourceDoName', required: true },
				{ name: 'sourceDaName', required: false },
			],
		},
		{
			attribute: { path: 'extRefAddr', uuid: 'extRefUuid' },
			resolution: 'ied-address',
			target: ['ExtRef'],
			companions: [],
		},
		{
			attribute: { path: 'resourceName', uuid: 'resourceUuid' },
			resolution: 'ancestor-name',
			target: ['ProcessResource'],
			companions: [],
		},
	],
	SubscriberLNode: [
		{
			attribute: { path: 'resourceName', uuid: 'resourceUuid' },
			resolution: 'ancestor-name',
			target: ['ProcessResource'],
			companions: [],
		},
	],
	Terminal: [
		{
			attribute: { path: 'connectivityNode', uuid: 'cNodeUuid' },
			resolution: 'direct',
			target: ['ConnectivityNode'],
			companions: [],
		},
	],
	VariableApplyTo: [
		{
			attribute: { path: 'element', uuid: 'elementUuid' },
			resolution: 'unsupported',
			// A Variable applies to ANY element; the target scope is the full SCL element set.
			target: ELEMENT_NAMES,
			companions: [
				{ name: 'doName', required: false },
				{ name: 'daName', required: false },
			],
		},
	],
	VariableRef: [
		{
			attribute: { path: 'variable', uuid: 'variableUuid' },
			resolution: 'direct',
			target: ['Variable'],
			companions: [],
		},
	],
} as const

/**
 * The references of the IED section that name their target by several attributes (a tuple: the IED,
 * then its logical device, logical node, access point or control block) beside one uuid attribute.
 * The IED is named by an attribute, by the element's text (`IEDName`), by the IED the referrer sits
 * in (`FCDA`, `ServerAt`) or by its parent (`GSE` / `SMV`, by their `ConnectedAP`). A name the
 * referrer leaves out takes its schema value; a control block named without its logical node is in
 * LN0. Kept apart from {@link UUID_REFERENCE_PAIRS}, which names each target by one path.
 */
export const TUPLE_REFERENCE_PAIRS = {
	Association: [
		{
			attribute: { uuid: 'lnUuid' },
			target: ['LN', 'LN0'],
			tuple: {
				ied: { attribute: 'iedName' },
				lDevice: 'ldInst',
				prefix: 'prefix',
				lnClass: 'lnClass',
				lnInst: 'lnInst',
			},
		},
	],
	ClientLN: [
		{
			attribute: { uuid: 'lnUuid' },
			target: ['LN', 'LN0'],
			tuple: {
				ied: { attribute: 'iedName' },
				lDevice: 'ldInst',
				prefix: 'prefix',
				lnClass: 'lnClass',
				lnInst: 'lnInst',
			},
		},
	],
	ConnectedAP: [
		{
			attribute: { uuid: 'apUuid' },
			target: ['AccessPoint'],
			tuple: { ied: { attribute: 'iedName' }, accessPoint: 'apName' },
		},
	],
	ExtCtrl: [
		{
			attribute: { uuid: 'lnUuid' },
			target: ['LN', 'LN0'],
			tuple: {
				ied: { attribute: 'iedName' },
				lDevice: 'ldInst',
				prefix: 'prefix',
				lnClass: 'lnClass',
				lnInst: 'lnInst',
			},
		},
	],
	ExtRef: [
		{
			attribute: { uuid: 'lnUuid' },
			target: ['LN', 'LN0'],
			tuple: {
				ied: { attribute: 'iedName' },
				lDevice: 'ldInst',
				prefix: 'prefix',
				lnClass: 'lnClass',
				lnInst: 'lnInst',
			},
		},
		{
			attribute: { uuid: 'srcCBUuid' },
			target: ['GSEControl', 'SampledValueControl', 'ReportControl'],
			// a control block named without its logical device is in the one of the data subscribed to
			otherwise: { lDevice: 'ldInst' },
			// control blocks of different kinds may share a name: the service names the kind
			targetByAttribute: {
				attribute: 'serviceType',
				tags: { GOOSE: 'GSEControl', SMV: 'SampledValueControl', Report: 'ReportControl' },
			},
			tuple: {
				ied: { attribute: 'iedName' },
				lDevice: 'srcLDInst',
				prefix: 'srcPrefix',
				lnClass: 'srcLNClass',
				lnInst: 'srcLNInst',
				controlBlock: 'srcCBName',
			},
		},
	],
	FCDA: [
		{
			attribute: { uuid: 'lnUuid' },
			target: ['LN', 'LN0'],
			tuple: {
				ied: { ancestor: true },
				lDevice: 'ldInst',
				prefix: 'prefix',
				lnClass: 'lnClass',
				lnInst: 'lnInst',
			},
		},
	],
	GSE: [
		{
			attribute: { uuid: 'cbUuid' },
			target: ['GSEControl'],
			tuple: { ied: { parentAttribute: 'iedName' }, lDevice: 'ldInst', controlBlock: 'cbName' },
		},
	],
	IEDName: [
		{
			attribute: { uuid: 'apUuid' },
			target: ['AccessPoint'],
			tuple: { ied: { text: true }, accessPoint: 'apRef' },
			onlyWithout: ['ldInst'],
		},
		{
			attribute: { uuid: 'ldUuid' },
			target: ['LDevice'],
			tuple: { ied: { text: true }, lDevice: 'ldInst' },
			onlyWithout: ['lnClass'],
		},
		{
			attribute: { uuid: 'lnUuid' },
			target: ['LN', 'LN0'],
			tuple: {
				ied: { text: true },
				lDevice: 'ldInst',
				prefix: 'prefix',
				lnClass: 'lnClass',
				lnInst: 'lnInst',
			},
		},
	],
	KDC: [
		{
			attribute: { uuid: 'apUuid' },
			target: ['AccessPoint'],
			tuple: { ied: { attribute: 'iedName' }, accessPoint: 'apName' },
		},
	],
	ServerAt: [
		{
			attribute: { uuid: 'apUuid' },
			target: ['AccessPoint'],
			tuple: { ied: { ancestor: true }, accessPoint: 'apName' },
		},
	],
	SMV: [
		{
			attribute: { uuid: 'cbUuid' },
			target: ['SampledValueControl'],
			tuple: { ied: { parentAttribute: 'iedName' }, lDevice: 'ldInst', controlBlock: 'cbName' },
		},
	],
} as const satisfies TupleReferencePairsShape

/**
 * Reference tags that carry semantic CONTENT beyond the pointer: the eIEC signal specs
 * (`DOS`/`SDS`/`DAS`), the dataflow bindings (`SourceRef`/`ControlRef`), behaviour
 * variables (`InputVar`/`OutputVar`) and `ProcessEcho`. Central, single-source-of-truth
 * policy consumed in two places:
 *  - orphan cleanup KEEPS such an element when its ref is orphaned (clears only the
 *    uuid/path/companion attributes) instead of deleting it;
 *  - the lifecycle dropped-link removal treats an author-added, uuid-less one as
 *    `target-only` content (preserved by default), NOT a dropped link.
 * Authored from the ref-tag keys (`satisfies` validates each is a real reference tag) but
 * exposed as a `ReadonlySet<string>` so a plain `tagName` lookup needs no cast.
 */
const KEEP_ON_ORPHAN_REF_TAGS = [
	'SourceRef',
	'ControlRef',
	'DOS',
	'SDS',
	'DAS',
	'InputVar',
	'OutputVar',
	'ProcessEcho',
] as const satisfies readonly (keyof typeof UUID_REFERENCE_PAIRS)[]

export const KEEP_ON_ORPHAN_REFS: ReadonlySet<string> = new Set<string>(KEEP_ON_ORPHAN_REF_TAGS)

/** All reference tag names (keys of {@link UUID_REFERENCE_PAIRS}), typed for iteration. */
export const REFERENCE_TAGS = Object.keys(
	UUID_REFERENCE_PAIRS,
) as (keyof typeof UUID_REFERENCE_PAIRS)[]

/** Reference tag names as a string set, for membership tests (`has(tagName)`). */
export const REFERENCE_TAG_NAMES: ReadonlySet<string> = new Set(REFERENCE_TAGS)

/**
 * All element types that can be **targeted** by a UUID reference — the flattened
 * `target` arrays of {@link UUID_REFERENCE_PAIRS}. Use to recognise a referenceable
 * element (e.g. index its path -> uuid on import).
 */
export const TARGET_ELEMENT_TYPES: ReadonlySet<string> = new Set(
	Object.values(UUID_REFERENCE_PAIRS).flatMap((pairs) => pairs.flatMap((pair) => pair.target)),
)
