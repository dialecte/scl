import { buildPairsByRefMap, buildResolutionsToTargetRefsMap } from './helpers'

/**
 * How a SCL reference path value should be resolved to a UUID.
 *
 * - direct:               the path value IS the exact lookup key
 * - lnode:                LNodeSpecNaming / IEC 7-2 ObjectReference - strip ".DO[.DA]" qualifier from the last segment to get the LN/LNode lookup key
 * - iedAddress:           ExtRef/ExtCtrl address - indexed by full IED-internal path, exact match with IED-relative fallback
 * - behaviorDescription:  path relative to parent BehaviorDescription scope
 * - unsupported:          path format requires context not available during streaming
 */
export const RESOLUTION_TYPE = {
	direct: 'direct',
	lnode: 'lnode',
	iedAddress: 'ied-address',
	behaviorDescription: 'behavior-description',
	unsupported: 'unsupported',
} as const

/**
 * Complete mapping of elements that have path/name → UUID reference pairs.
 *
 * Each entry maps an element tag to its reference attribute pairs where:
 * - `path`: the attribute holding a pathname or name reference
 * - `uuid`: the corresponding UUID attribute that identifies the same target
 * - `target`: the element tag(s) the UUID resolves to
 * - `companions`: attributes that must/may be set when the UUID is used
 */
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
			resolution: 'direct',
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
			resolution: 'direct',
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
			target: ['SourceRef'],
			companions: [],
		},
	],
	LNodeOutputRef: [
		{
			attribute: { path: 'controlRef', uuid: 'controlRefUuid' },
			resolution: 'direct',
			target: ['ControlRef'],
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
				{ name: 'sourceDaName', required: true },
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
				{ name: 'sourceDaName', required: true },
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
			resolution: 'direct',
			target: ['ProcessResource'],
			companions: [],
		},
	],
	SubscriberLNode: [
		{
			attribute: { path: 'resourceName', uuid: 'resourceUuid' },
			resolution: 'direct',
			target: ['ProcessResource'],
			companions: [],
		},
	],
	VariableApplyTo: [
		{
			attribute: { path: 'element', uuid: 'elementUuid' },
			resolution: 'unsupported',
			target: ['LNode', 'Function', 'SubFunction', 'EqFunction', 'EqSubFunction'],
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

// ── Resolution target map ────────────────────────────────────────────────────

/**
 * Maps each resolution strategy to a map of target tagName → RefEntry[].
 *
 * Built once at module load from UUID_REFERENCE_PAIRS.
 * Use to look up which referrer elements point to a given target under a given strategy.
 *
 * @example
 * const entries = RESOLUTION_TARGET_REFS['direct'].get('Function') ?? []
 */
export const RESOLUTION_TARGET_REFS = buildResolutionsToTargetRefsMap(UUID_REFERENCE_PAIRS)

/**
 * Resolution types that produce a computable path value.
 * Excludes 'unsupported' which requires context not available at resolution time.
 */
export const RESOLVABLE_RESOLUTIONS = [
	RESOLUTION_TYPE.direct,
	RESOLUTION_TYPE.lnode,
	RESOLUTION_TYPE.iedAddress,
	RESOLUTION_TYPE.behaviorDescription,
] as const

/**
 * Maps ref tagName → list of its UUID pair entries (flattened).
 * Use for ref-side lookups (afterCreated REF case, beforeDelete sweeps).
 */
export const PAIRS_BY_REF = buildPairsByRefMap(UUID_REFERENCE_PAIRS)

/**
 * Ref tag names where the record is kept even when all uuid refs are orphaned.
 * Only the uuid/path/companion attributes are cleared; non-ref attributes preserved.
 *
 * Rule: elements with semantic content beyond the ref pointer (e.g. service, sourceDoName)
 * should be preserved with cleared pointers rather than deleted.
 */
export const KEEP_ON_ORPHAN_REFS: ReadonlySet<keyof typeof UUID_REFERENCE_PAIRS> = new Set<
	keyof typeof UUID_REFERENCE_PAIRS
>(['SourceRef', 'ControlRef', 'DOS', 'SDS', 'DAS', 'InputVar', 'OutputVar', 'ProcessEcho'])

/**
 * Maps ref tag names to their container tag names that should be cleaned up
 * when all children of that ref type are removed (inner→outer for nested cases).
 */
export const REF_CONTAINERS: Partial<Record<keyof typeof UUID_REFERENCE_PAIRS, readonly string[]>> =
	{
		FunctionCatRef: ['SubCategory', 'FunctionCategory'],
		PowerSystemRelation: ['PowerSystemRelations'],
		Resource: ['ProcessResource', 'ProcessResources'],
		VariableApplyTo: ['Variable'],
	} as const

/**
 * All uuid attribute names from UUID_REFERENCE_PAIRS, deduplicated.
 * Use as the attribute list for remapUuidAttrs so new ref pairs are automatically covered.
 */
export const ALL_REF_UUID_ATTRIBUTES: readonly string[] = [
	...new Set(
		Object.values(UUID_REFERENCE_PAIRS).flatMap((pairs) =>
			pairs.map((pair) => pair.attribute.uuid),
		),
	),
]
