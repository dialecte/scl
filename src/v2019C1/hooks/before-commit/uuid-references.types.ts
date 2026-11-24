import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { AnyRawRecord } from '@dialecte/core'

/** A pair of a reference the transaction wrote, holding its uuid: the referrer as the commit leaves it. */
export type BoundPair = { record: AnyRawRecord; pair: ReferencePair; uuid: string }

/** A written pair whose uuid names `target` and whose path is empty. */
export type UnnamedPair = BoundPair & { target: AnyRawRecord }

/** Why the commit refuses a uuid reference (`REFERENCE_INCOHERENT`'s `meta.reason`). */
export type UuidReferenceRefusalReason = 'data-missing' | 'groups-together' | 'out-of-scope'

/** A reference the commit refuses, the uuid attribute of the pair it names, and why. */
export type UuidReferenceRefusal = {
	record: AnyRawRecord
	uuidAttribute: string
	reason: UuidReferenceRefusalReason
}

/** The elements of the subtrees a transaction moved, as the move step read them. */
export type MovedElements = { ids: Iterable<string>; read: ReadonlyMap<string, AnyRawRecord> }
