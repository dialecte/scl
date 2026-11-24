import type { BuildRefusal, PlannedLogicalNode } from '../transaction/build-ied.types'
import type { Scl } from '@/v2019C1/config'

/** A logical node's identity in its logical device. */
export type LnIdentity = { prefix: string; lnClass: string; inst: string }

/** What a rebuild of an IED built before changes, and what it keeps; empty on a first build of new logical devices. */
export type IedRebuildReport = {
	/** Logical devices and the LNodes built anew in an IED built before. */
	added: { lDevices: string[]; logicalNodes: Scl.Ref<'LNode'>[] }
	/** Logical nodes moved to the logical device their function now gives (only with `rederiveLDevices`). */
	moved: { ln: Scl.Ref<'LN' | 'LN0'>; fromLd: string; toLd: string }[]
	/** Logical nodes whose identity follows the specification naming. */
	renamed: { ln: Scl.Ref<'LN'>; from: LnIdentity; to: LnIdentity }[]
	/** Logical nodes whose type follows the LNode's, with the values the new type does not hold. */
	retyped: {
		ln: Scl.Ref<'LN' | 'LN0'>
		from: string
		to: string
		valuesRemoved: Scl.Ref<'DAI'>[]
	}[]
	/** Logical nodes no LNode specifies any more, and logical devices this run emptied. */
	removed: { logicalNodes: Scl.Ref<'LN'>[]; lDevices: Scl.Ref<'LDevice'>[] }
	/** Logical nodes no LNode specifies any more, kept because something names them. */
	keptInUse: { ln: Scl.Ref<'LN'>; usedBy: Scl.Ref<Scl.ElementsOf>[] }[]
	/** Logical nodes of the IED bound by LNodes the rebuild was not given: untouched. */
	boundOutsideScope: { ln: Scl.Ref<'LN' | 'LN0'>; lnode: Scl.Ref<'LNode'> }[]
	/** Logical devices outside the rebuild holding only logical nodes no LNode specifies: not removed. */
	orphanLDevices: { lDevice: Scl.Ref<'LDevice'>; orphans: Scl.Ref<'LN'>[] }[]
	/**
	 * Orphans whose LNode a real IED implements now (its specification naming still naming them): the reason they are
	 * removed or kept in use, with that IED.
	 */
	implementedElsewhere: {
		ln: Scl.Ref<'LN'>
		lnode: Scl.Ref<'LNode'>
		ied: Scl.Ref<'IED'>
		iedName: string
	}[]
	/** LNodes whose own names differ from their logical node's: not acted on. */
	drift: { lnode: Scl.Ref<'LNode'>; ln: Scl.Ref<'LN' | 'LN0'> }[]
	/** Values planned on logical nodes built before: new DAIs, and DAIs whose values change. */
	values: { added: number; changed: number }
}

/** A bound LNode paired with its logical node: the logical node as the rebuild leaves it, and what changes. */
export type PairedLNodes = {
	logicalNodes: PlannedLogicalNode[]
	renamed: IedRebuildReport['renamed']
	retyped: IedRebuildReport['retyped']
	drift: IedRebuildReport['drift']
	refusals: BuildRefusal[]
}

/** What applying a rebuild writes beyond the report: the DOIs or DAIs a retype drops, the moved LNodes' `sLdInst`. */
export type RebuildWrites = {
	/** A DOI whose every value goes, else the DAIs that go. */
	valueRemovals: Scl.Ref<'DOI' | 'DAI'>[]
	namingUpdates: { naming: Scl.Ref<'LNodeSpecNaming'>; sLdInst: string }[]
	/** LNodes bound to another logical node already there (an LLN0 LNode to its new logical device's LN0). */
	rebindings: { lnode: Scl.Ref<'LNode'>; lnUuid: string }[]
}
