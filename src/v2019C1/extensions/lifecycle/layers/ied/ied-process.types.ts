import type { Scl } from '@/v2019C1/config'
import type { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import type { ProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section.types'
import type { SectionNode } from '@/v2019C1/extensions/dataflow/query/section-node.types'
import type { SatelliteIndex } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type { IedExtractParams } from '@/v2019C1/extensions/lifecycle/extract/transaction/ied.types'
import type { MappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'

/** The export options that leave a part of the process part out. */
export type ProcessOptions = Pick<
	IedExtractParams,
	'applications' | 'allocationRoles' | 'powerSystemRelations' | 'internalService'
>

/** The element each export option leaves out, by option. */
export type ProcessOptionTags = Readonly<
	Record<Exclude<keyof ProcessOptions, 'internalService'>, string>
>

/** What the process part of an IED export is planned from, read from the source once. */
export type IedProcessSource = {
	/** The process section: its elements, the document's own content only, and its LNodes by uuid and by path. */
	section: ProcessSection
	/** What implements each LNode of the section. */
	mapped: MappedLNodes
	/** The variables and behaviour descriptions of the document with the references they hold. */
	satellites: SatelliteIndex
	/** The elements of the IED, with their uuid and parent: what of them the IED part writes is what a reference may name. */
	iedElements: readonly IedElement[]
}

/** An element of the exported IED, as the process plan needs it: its id, its parent's, its uuid. */
export type IedElement = { id: string; parent: string | undefined; uuid: string }

/** What `planIedProcess` decides from. */
export type PlanIedProcessParams = {
	source: IedProcessSource
	iedRef: Scl.Ref<'IED'>
	/** What the IED part leaves out (record ids): an LNode implemented by one of those logical nodes is not written. */
	iedLeaveOut: ReadonlySet<string>
	options: ProcessOptions
}

/** The process section laid out for the plan, from its elements: each by id, by uuid, by path, and its children. */
export type ProcessIndex = {
	nodes: readonly SectionNode[]
	byId: ReadonlyMap<string, SectionNode>
	byUuid: ReadonlyMap<string, SectionNode>
	/** The elements holding a name path, by path; an LNode by its specified naming, as references name it. */
	byPath: ReadonlyMap<string, SectionNode>
	/** The children of each element read, by its id, in document order. */
	childrenOf: ReadonlyMap<string, readonly SectionNode[]>
	/** The roots of the process part (substations, lines, processes) directly under the document root. */
	roots: readonly SectionNode[]
}

/** The LNodes of the IED written, and those left out with what says why. */
export type SelectedLNodes = { ids: ReadonlySet<string>; warnings: ExtractWarning[] }

/** The plan's state between its steps: what the steps so far leave out (record ids). */
export type ProcessScope = {
	index: ProcessIndex
	/** The written LNodes of the IED. */
	lnodes: ReadonlySet<string>
	/** The uuids of what the IED part writes: a process reference may name one. */
	iedUuids: ReadonlySet<string>
	leaveOut: ReadonlySet<string>
}

/** Ids left out by a step, with what it says about them. */
export type ProcessStepResult = { leaveOut: ReadonlySet<string>; warnings: ExtractWarning[] }

/** An attribute change on a written element, by its source record. */
export type RecordEdit = {
	ref: Scl.Ref<Scl.ElementsOf>
	attributes: Readonly<Record<string, string | undefined>>
}

/** The specified naming a written LNode gets: its own naming, on its `LNodeSpecNaming` when it has one. */
export type ProcessNaming = {
	lnode: Scl.Ref<'LNode'>
	specNaming: Scl.Ref<'LNodeSpecNaming'> | undefined
	attributes: Readonly<Record<string, string | undefined>>
}

/** What the process part of an IED export writes, all in the source's terms. */
export type IedProcessPlan = {
	/** The roots cloned, in document order. */
	roots: readonly Scl.Ref<Scl.ElementsOf>[]
	/** What the clones leave out, with what it holds (record ids). */
	leaveOut: ReadonlySet<string>
	edits: readonly RecordEdit[]
	namings: readonly ProcessNaming[]
	warnings: ExtractWarning[]
}

/** One link of a reference, as the reference registry declares it. */
export type ReferencePair = (typeof UUID_REFERENCE_PAIRS)[keyof typeof UUID_REFERENCE_PAIRS][number]
