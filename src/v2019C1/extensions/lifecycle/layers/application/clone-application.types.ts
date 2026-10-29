import type { Scl } from '@/v2019C1/config'
import type { ReferencedSatellites } from '@/v2019C1/extensions/lifecycle/cross-cutting/clone-applied-satellites.types'
import type { HeldApplications } from '@/v2019C1/extensions/lifecycle/cross-cutting/held-applications.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type CloneApplicationContentResult = {
	/** All source -> target clone mappings for the application content. */
	cloneMappings: Scl.CloneMapping[]
	/** Shared elements mapped onto elements the target already holds (nothing cloned for them). */
	redirectMappings: RedirectMapping[]
	/**
	 * What its roles refer to (a variable, a behaviour description), not cloned here: the caller places it with what
	 * applies to the application (`cloneAppliedSatellites`), so that one rule says where each lands and how it is named.
	 */
	referenced: ReferencedSatellites
	/**
	 * What its roles refer to that is not placed, nor the reference to it: a variable applying to nothing the placement
	 * places or lands on, or what a function the application stands on holds no copy of.
	 */
	satellitesNotPlaced: Scl.Ref<Scl.ElementsOf>[]
	/** What the project held, before anything was written, applying to what the placement lands on. */
	held: HeldApplications
}

/** A source AllocationRole that landed on a role the target already holds. */
export type AllocationRoleReuse = {
	sourceId: string
	sourceUuid: string
	existingRef: Scl.Ref<'AllocationRole'>
	/** The source role's children cloned under the existing role. */
	contributedMappings: Scl.CloneMapping[]
	/** Where the source role, and what it holds, landed on what the existing role holds. */
	redirectMappings: RedirectMapping[]
}

/** A function the application composes that it stands on: one the level already held for another application. */
export type TakenFunction = {
	sourceId: string
	sourceUuid: string
	target: Scl.Ref<Scl.ElementsOf>
}
