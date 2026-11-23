import type { Scl } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type { MappedLNode } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'
import type { AnyRawRecord } from '@dialecte/core'

/** An element of the process section with the elements above it, outermost first. */
export type SectionElement = { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }

/** A logical node of the target IED, as the build needs it. */
export type TargetLogicalNode = {
	ref: Scl.Ref<'LN' | 'LN0'>
	identity: { prefix: string; lnClass: string; inst: string }
	lnType: string
	uuid: string
}

/** A logical device of the target IED with its logical nodes. */
export type TargetLDevice = {
	ref: Scl.Ref<'LDevice'>
	inst: string
	logicalNodes: TargetLogicalNode[]
}

/** An LNode the build is asked to implement. */
export type RequestedLNode = {
	ref: Scl.Ref<'LNode'>
	record: AnyRawRecord
	/** Absent when the LNode is not in the process section (a function template). */
	section?: SectionElement
	/** The LN or LN0 implementing it, when one does. */
	implementation?: MappedLNode
}

/** A LNodeType the `lnType` rule may choose. */
export type TypeCandidate = { id: string; lnClass: string; inTargetDocument: boolean }

/** Everything a build plan is made from, read in a fixed number of reads. */
export type BuildInput = {
	ied: { ref: Scl.Ref<'IED'>; name: string; kind?: IedKind }
	servers: Scl.Ref<'Server'>[]
	lDevices: TargetLDevice[]
	/** The types the logical nodes of the target IED use. */
	targetIedTypes: ReadonlySet<string>
	lnodes: RequestedLNode[]
	/**
	 * The LNode bound to each logical node of the target IED, by the logical node's id: by `lnUuid` (a truthy one decides
	 * alone), else by its names (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`).
	 */
	boundLNodeOf: ReadonlyMap<string, SectionElement>
	/** The function-likes whose names may clash: the context document's process section, in document order. */
	clashSet: SectionElement[]
	/** The target document's LNodeTypes, then the context document's it lacks, each in document order. */
	types: TypeCandidate[]
}
