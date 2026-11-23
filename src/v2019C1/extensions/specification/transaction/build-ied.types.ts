import type {
	BUILD_OPEN_POINTS,
	BUILD_REFUSAL_REASONS,
	FUNCTION_LIKE_TAGS,
} from './build-ied.constants'
import type { Scl, Config } from '@/v2019C1/config'
import type { OpenValues } from '@/v2019C1/helpers/open-values.types'
import type * as Core from '@dialecte/core'

export type FunctionLikeTag = (typeof FUNCTION_LIKE_TAGS)[number]

/** Every element an LNode may sit in. */
export type LNodeContainerTag = Scl.ParentsOf<'LNode'>

export type BuildRefusalReason = (typeof BUILD_REFUSAL_REASONS)[number]

export type BuildOpenPoint = (typeof BUILD_OPEN_POINTS)[number]

/** What the `ldInst` rule is asked about: the element whose logical nodes go to one logical device. */
export type LdInstContext = {
	container: Scl.Ref<LNodeContainerTag>
	containerName: string
	/** The engine's normalised name, when the standard's rule gives one. */
	derived?: string
}

/** What the `lnType` rule is asked about: a logical node whose type the standard does not give. */
export type LnTypeContext = {
	kind: 'LN' | 'LN0' | 'LPHD'
	lnClass: string
	/** Absent for an added LN0 or LPHD. */
	lnode?: Scl.Ref<'LNode'>
	/** The LNodeTypes of that lnClass, in document order; `inTargetIed` when a logical node of the target IED uses it. */
	candidates: readonly { id: string; inTargetIed: boolean }[]
}

export type BuildOpenValues = OpenValues<{ ldInst: LdInstContext; lnType: LnTypeContext }>

export type BuildIedParams = {
	/** A specification IED. */
	ied: Scl.Ref<'IED'>
	/** The logical nodes the IED must implement. */
	lnodes: readonly Scl.Ref<'LNode'>[]
	/** Required only when the IED has several servers. */
	server?: Scl.Ref<'Server'>
	/** A leaf subfunction's name becomes the prefix of its logical nodes that have none. Default `false`. */
	prefixFromLeafSubFunction?: boolean
	/** Rules for the values the standard leaves open; absent, an open value is refused. */
	openValues?: BuildOpenValues
	/**
	 * The document whose function-likes decide name clashes and whose LNodeTypes are offered to the `lnType` rule
	 * beside the target's. Default: the document built in.
	 */
	contextQuery?: Core.Query<Config>
}

export type BuildRefusal = {
	reason: BuildRefusalReason
	ref?: Scl.Ref<Scl.ElementsOf>
	detail: string
}

export type PlannedLDevice = {
	inst: string
	from: Scl.Ref<LNodeContainerTag> | 'lnode-ldInst'
	existing?: Scl.Ref<'LDevice'>
}

export type PlannedLogicalNode = {
	lnode: Scl.Ref<'LNode'>
	lDeviceInst: string
	kind: 'LN0' | 'LN'
	identity: { prefix: string; lnClass: string; inst: string }
	lnType: string
	/** Already built and bound to this LNode. */
	existing?: Scl.Ref<'LN' | 'LN0'>
}

export type PlannedAddition = { lDeviceInst: string; kind: 'LN0' | 'LPHD'; lnType: string }

export type LeftOutLNode = {
	lnode: Scl.Ref<'LNode'>
	reason: 'implemented-elsewhere'
	ied: Scl.Ref<'IED'>
}

export type OpenValueUsed = {
	point: BuildOpenPoint
	element: Scl.Ref<Scl.ElementsOf>
	value: string
}

export type IedBuildPlan = {
	lDevices: PlannedLDevice[]
	logicalNodes: PlannedLogicalNode[]
	/** The LN0 and LPHD the standard adds. */
	added: PlannedAddition[]
	/** LNodes implemented by another IED: not built. */
	leftOut: LeftOutLNode[]
	/** Every value a caller rule supplied. */
	openValuesUsed: OpenValueUsed[]
	/** Why the build cannot be written; empty when it can. */
	refusals: BuildRefusal[]
}

export type IedBuildResult = {
	plan: IedBuildPlan
	created: { lDevices: Scl.Ref<'LDevice'>[]; logicalNodes: Scl.Ref<'LN' | 'LN0'>[] }
	bound: Scl.Ref<'LNode'>[]
}
