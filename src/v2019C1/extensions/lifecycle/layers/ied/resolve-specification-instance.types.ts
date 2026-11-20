import type { Config, Scl } from '@/v2019C1/config'
import type { ProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section.types'
import type { SectionNode } from '@/v2019C1/extensions/dataflow/query/section-node.types'
import type {
	SsdScope,
	TopologyReconcilables,
} from '@/v2019C1/extensions/lifecycle/layers/topology'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/** What `resolveSpecificationInstance` takes. */
export type ResolveSpecificationInstanceParams = {
	sourceQuery: Core.Query<Config>
	/** The IED of the project the specification is read for. */
	iedRef: Scl.Ref<'IED'>
	/** The specification of the template: see `resolveSsdScope`. */
	scope: SsdScope
	/** Its applications and the functions none of them composes. */
	reconcilables: TopologyReconcilables
	/** What a project element carries of the template element it stands for: its lineage, or in a fork its uuid. */
	matchKey: MatchKey
}

/** The specification of an IED in the project, as a placement of the template's put it there. */
export type SpecificationInstance = {
	/** The levels of the project it sits on, of the kind of the template's unit (its bay). */
	frames: Scl.Ref<Scl.ElementsOf>[]
	/**
	 * The level what the revision gains is placed in: its only frame, or among several the one the template puts it in
	 * (see `singleOutFrame`). Absent with several and none singled out: nothing gained is placed (`unresolved`).
	 */
	gainedIn?: Scl.Ref<Scl.ElementsOf>
	/** Its LNodes: those specified on the IED (record ids). */
	lnodes: ReadonlySet<string>
	/** The instances of the template's applications and functions it holds. */
	primaries: Scl.Ref<Scl.ElementsOf>[]
	/**
	 * The template's applications and functions holding no LNode of the IED, of which its level holds several instances
	 * specified on no IED (which is the IED's is not told, none is updated), or which the revision gains while the
	 * specification sits on several levels none singled out (where it goes is not told, it is not placed).
	 */
	unresolved: Scl.Ref<Scl.ElementsOf>[]
	/**
	 * The template's applications and functions the update leaves alone (record ids): those `unresolved`, and those its
	 * level holds only instances of specified on another IED (another placement's, never placed again for this one).
	 */
	leftOut: ReadonlySet<string>
	/**
	 * What a removal of which takes away a binding the project gave another IED (record ids): each LNode of the
	 * specification bound to another IED, and what holds it below the level.
	 */
	unbinding: ReadonlySet<string>
}

/** An LNode of the process section specified on an IED: its section node and the IED named. */
export type SpecifiedLNode = { node: SectionNode; on: string }

/** What `claimUnbound` reads the template's other primaries from. */
export type ClaimUnboundParams = {
	sourceQuery: Core.Query<Config>
	/** The process section's nodes: see `readProcessSection`. */
	nodes: readonly SectionNode[]
	templatePrimaries: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The primaries of the IED's specification, told by its LNodes. */
	claimed: readonly AnyRawRecord[]
	/** The primaries of the project holding an LNode specified on another IED (record ids). */
	othersPrimaryIds: ReadonlySet<string>
	/** The levels the IED's specification sits on (record ids). */
	frameIds: ReadonlySet<string>
	/** What a project element carries of the template element it stands for: its lineage, or in a fork its uuid. */
	matchKey: MatchKey
	/** Whether what the revision gains can be placed: one level, or one singled out among several. */
	placeable: boolean
}

/** The template's other primaries: claimed, not told apart, another placement's. */
export type UnboundPrimaries = {
	claimed: AnyRawRecord[]
	unresolved: Scl.Ref<Scl.ElementsOf>[]
	others: Scl.Ref<Scl.ElementsOf>[]
}

/** What `specifiedLNodes` reads. */
export type SpecifiedLNodesParams = { section: ProcessSection }

/** One node of the process section. */
export type SectionNodeParams = { node: SectionNode }

/** What `unbindingIds` reads: the IED's LNodes, its name, the tag of the template's unit. */
export type UnbindingIdsParams = {
	own: readonly SectionNode[]
	iedName: string | undefined
	unitTag: string
}

/** What `composingApplications` reads: the section's nodes, the specification's primaries, another IED's. */
export type ComposingApplicationsParams = {
	nodes: readonly SectionNode[]
	primaries: readonly AnyRawRecord[]
	/** The primaries holding an LNode specified on another IED (record ids). */
	othersPrimaryIds: ReadonlySet<string>
}

/** What `singleOutFrame` chooses among: the IED's frames and the uuid of the template's unit. */
export type SingleOutFrameParams = {
	frames: readonly AnyRawRecord[]
	unitUuid: string | undefined
	/** What a project element carries of the template element it stands for: its lineage, or in a fork its uuid. */
	matchKey: MatchKey
}

/** A record of the project, and what it carries of the template element it stands for. */
export type LineageOfParams = {
	record: AnyRawRecord
	matchKey: MatchKey
}
