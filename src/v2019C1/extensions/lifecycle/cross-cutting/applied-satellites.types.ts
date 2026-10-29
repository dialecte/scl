import type { Scl } from '@/v2019C1/config'

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
}

/** A satellite applying to what travels with a primary, with the targets it applies to among those read (record ids). */
export type AppliedSatellite = { satelliteRef: Scl.Ref<Scl.ElementsOf>; targetIds: string[] }
