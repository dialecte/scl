import type { PrunedElement } from './prune-emptied-containers.types'
import type { Scl } from '@/v2019C1/config'
import type { NamedIdentity } from '@/v2019C1/hooks/shared/element-identity.types'
import type { AnyRawRecord } from '@dialecte/core'

/** A record the move step writes: as the commit read it first, and as the step leaves it. */
export type MoveWrite = { oldRecord: AnyRawRecord; newRecord: AnyRawRecord }

/**
 * The references a move leaves naming what their new place cannot name: cleared (kept, with the attributes to clear),
 * or deleted.
 */
export type UnboundReferences = {
	cleared: readonly { record: AnyRawRecord; attributes: ReadonlySet<string> }[]
	deleted: readonly AnyRawRecord[]
}

/** Where a tuple reference reads the IED it names: its parent's attribute, or the IED it sits in. */
export type PlaceReadingRole = 'parent' | 'ied'

/** How a connection names its access point: its uuid attribute, the attribute naming the IED, the one naming the access point. */
export type ConnectionNaming = { uuid: string; ied: string; accessPoint: string }

/** How an address names its control block: its uuid attribute, the attribute naming the logical device, the one naming the block. */
export type AddressNaming = { uuid: string; lDevice: string; controlBlock: string }

/**
 * Why a move removes an element at the commit: its new place cannot reach what it names (`out-of-reach`), or it is a
 * terminal left naming a node its container may not name (`terminal-across-containers`). What goes with either of them
 * - a container left holding nothing, what named that container in turn - carries the reason of the removal it
 * followed.
 */
export type MoveRemovalReason = 'out-of-reach' | 'terminal-across-containers'

/**
 * An element the moves of a commit remove: deleted, or kept with the names it can no longer reach cleared. A record a
 * removed element holds goes with it and is not listed on its own.
 */
export type MoveRemoval = {
	element: PrunedElement
	/** What names it for a person, where its tag has it. */
	identity: NamedIdentity
	effect: 'deleted' | 'cleared'
	reason: MoveRemovalReason
	/** Every record it takes with it, its own subtree: each goes with it and is not listed on its own. */
	holds: readonly Scl.RawRecord<Scl.ElementsOf>[]
}

/** What the moves of a commit stage, and every element they remove on the way. */
export type FollowedMoves = {
	operations: Scl.Operation[]
	removals: MoveRemoval[]
}
