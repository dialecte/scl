import type { Scl } from '@/v2019C1/config'
import type { OrphanedRef } from '@/v2019C1/hooks/before-delete'
import type { AnyRawRecord } from '@dialecte/core'

/** A record the move step writes: as the commit read it first, and as the step leaves it. */
export type MoveWrite = { oldRecord: AnyRawRecord; newRecord: AnyRawRecord }

/** The references a move leaves naming what their new place cannot name: cleared (kept), or deleted. */
export type UnboundReferences = {
	cleared: OrphanedRef[]
	deleted: Scl.RawRecord<Scl.ElementsOf>[]
}

/** Where a tuple reference reads the IED it names: its parent's attribute, or the IED it sits in. */
export type PlaceReadingRole = 'parent' | 'ied'
