import type { Scl } from '@/v2019C1/config'
import type { IndexedSatellite } from '@/v2019C1/extensions/lifecycle/cross-cutting/applied-satellites.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type { AnyTreeRecord } from '@dialecte/core'

/** A satellite the roles of an application refer to, with the references naming it (record ids). */
export type ReferencedSatellite = IndexedSatellite & {
	/** The references of the roles naming it. */
	referenceIds: string[]
}

/**
 * What a placement does with what the roles of an application refer to (a variable, a behaviour description): each is
 * placed whole, its references naming what the placement places or lands on, the others left out (`leaveOut`). A
 * variable then applying to nothing is not placed, nor the references to it (`unplaced`, `unplacedReferenceIds`). One
 * inside a function the application stands on is the copy that function holds (`copies`), or, when it holds none, not
 * placed either. One the placement places with another clone (a function it places holds it) is left to that clone.
 */
export type RoleSatellites = {
	placed: Scl.Ref<Scl.ElementsOf>[]
	/** The uuid of each satellite placed, by record id. */
	placedUuids: Map<string, string>
	unplaced: Scl.Ref<Scl.ElementsOf>[]
	unplacedReferenceIds: Set<string>
	/** The references below the satellites placed that name what the placement neither places nor lands on. */
	leaveOut: Set<string>
	/** Where each satellite inside a function stood on is (the copy the function holds), as a redirect. */
	copies: RedirectMapping[]
	/** The satellites a copy stands for (record ids): not placed again. */
	copiedIds: Set<string>
}

/** A function an application stands on: its source uuid and the function of the project it stands on. */
export type StoodOnFunction = Pick<RedirectMapping, 'sourceUuid' | 'target'>

/** A function stood on: what the template's function holds and what the project's function holds. */
export type StoodOnPair = {
	source: { uuids: Set<string>; satellites: AnyTreeRecord[] }
	project: { uuids: Set<string>; satellites: AnyTreeRecord[] }
}
