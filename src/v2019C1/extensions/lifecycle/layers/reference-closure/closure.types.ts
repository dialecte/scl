import type { CLOSURE_MODEL_TAGS } from './closure.constants'
import type { Scl } from '@/v2019C1/config'
import type { DataTypes } from '@/v2019C1/extensions/data-model/query/data-types.types'
import type * as Core from '@dialecte/core'

/** A root of a closure: an IED with its whole subtree, a control block or a logical node with only what it references. */
export type ClosureSeed =
	| { ref: Scl.Ref<'IED'>; depth: 'whole' }
	| { ref: Scl.Ref<'GSEControl' | 'SampledValueControl' | 'ReportControl'>; depth: 'interface' }
	/** A logical node named without a control block (an input polling it): it, its logical device, its connection's address. */
	| { ref: Scl.Ref<'LN' | 'LN0'>; depth: 'interface' }

/** The records a closure reads, by tag: every IED of the document, its IED section, and every connection with its GSE and SMV. */
export type ClosureModel = {
	readonly [Tag in (typeof CLOSURE_MODEL_TAGS)[number]]: readonly Scl.RawRecord<Tag>[]
}

/** The data model a type closure follows: the members of each logical node, data object and data attribute type. */
export type ClosureTypeModel = DataTypes

/** What the closure keeps of one IED: all of it, or only what its interface roots reference (then marked `fix`). */
export type IedClosure = {
	depth: 'whole' | 'interface'
	/** The records under the IED left out, each the top of what goes (its subtree goes with it). */
	leaveOut: ReadonlySet<string>
	/** The engineering right a partial IED is written with: `fix`, not engineered in the file. */
	engRight?: 'fix'
	/** What a partial IED keeps: the uuids of its kept logical nodes and control blocks, those blocks. */
	keep?: InterfaceKeep
}

/** What a closure keeps: per IED, per connection of a partial IED, and the logical nodes whose types travel. */
export type ClosurePlan = {
	ieds: ReadonlyMap<string, IedClosure>
	/** Per connection of a partial IED: the records under it left out (the GSE / SMV of control blocks not kept). */
	connections: ReadonlyMap<string, { leaveOut: ReadonlySet<string> }>
	/** The connections of a partial IED on an access point the closure leaves out: they go whole. */
	droppedConnections: ReadonlySet<string>
	/** The data set members kept whose logical device or node the IED does not hold: the caller says so. */
	unresolvedMembers: ReadonlySet<string>
	/** The logical nodes (`LN`, `LN0`) the closure keeps. */
	logicalNodes: ReadonlySet<string>
}

/** The model of a closure by id, and every tuple target it holds by its address (`targetTupleAddress`). */
export type ClosureModelIndex = {
	byId: ReadonlyMap<string, Core.AnyRawRecord>
	targets: ReadonlyMap<string, string>
}

/** What an IED kept for its interface keeps: the uuids of its logical nodes and control blocks, and its control blocks. */
export type InterfaceKeep = { uuids: ReadonlySet<string>; controlBlocks: ReadonlySet<string> }
