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
