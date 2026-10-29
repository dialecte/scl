import type { Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
/** A reference naming a cross-cutting satellite by its uuid: the attribute holding the uuid, the satellite tags. */
export type SatelliteReferenceLink = { uuid: string; targets: readonly string[] }

/** The references of the registry named by a uuid, read loosely: per reference tag, its uuid attribute and targets. */
export type ReferencePairsByTag = Readonly<
	Record<string, readonly { attribute: { uuid: string }; target: readonly string[] }[]>
>

/** What `resolveAppliedSatellites` reads: the primary, what travels with it, what is left out. */
export type ResolveAppliedSatellitesParams = {
	primaryRef: Scl.Ref<Scl.ElementsOf>
	/** What travels with the primary (the functions an application composes): what applies to them is resolved too. */
	composedRefs?: readonly Scl.Ref<Scl.ElementsOf>[]
	/**
	 * Elements left out (record ids): a satellite applying only to them, or only through references left out, is not
	 * resolved.
	 */
	leftOut?: ReadonlySet<string>
	/**
	 * The primary is a topology frame (the scope of a substation template): what a level of it holds (its bay, an
	 * equipment) is no part of its clone, and resolved as a satellite from outside is.
	 */
	frame?: boolean
	/** The satellites of the document, read already by the caller: see `readSatelliteIndex`. */
	index?: SatelliteIndex
	/**
	 * With `frame`, what the placement places and lands on: what a level of the frame holds belongs to the frame, and
	 * travels with it when it applies to anything there — a level it lands on too.
	 */
	scope?: ContributionScope
}

/**
 * A satellite applying to what travels with a primary, its uuid, with the targets it applies to among those read (record
 * ids).
 */
export type AppliedSatellite = {
	satelliteRef: Scl.Ref<Scl.ElementsOf>
	uuid: string
	targetIds: string[]
}

/** A reference tag a satellite tag holds, with its pairs. */
export type HeldReferenceTag = {
	satelliteTag: string
	tagName: string
	pairs: ReferencePairsByTag[string]
}

/** A reference a satellite holds: its record id, its tag, and each uuid it names with the tags it may name. */
export type HeldReference = {
	id: string
	tagName: string
	names: readonly { uuid: string; targets: readonly string[] }[]
}

/** A cross-cutting satellite of a document, read with the references it holds. */
export type IndexedSatellite = {
	satelliteRef: Scl.Ref<Scl.ElementsOf>
	uuid: string
	/** The template reference it carries: the satellites of one template reference are copies of one another. */
	templateUuid: string
	/**
	 * The lineages a copy of it carries: its uuid, or the uuid of a satellite of its template reference — a function taken
	 * through a sibling of one template reference holds the copy of that sibling's satellite.
	 */
	lineages: readonly string[]
	references: HeldReference[]
}

/** The cross-cutting satellites of a document by record id, in document order: read once. */
export type SatelliteIndex = ReadonlyMap<string, IndexedSatellite>
