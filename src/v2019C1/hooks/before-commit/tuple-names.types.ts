import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type { AnyRawRecord } from '@dialecte/core'

/** The references of one tag, read once, with the pairs of that tag the commit writes. */
export type ReferrerGroup = {
	pairs: readonly TupleReferencePair[]
	records: readonly AnyRawRecord[]
}

/** A reference naming created targets by uuid: its pairs, and the uuids of the targets it names. */
export type NamingReferrer = {
	record: AnyRawRecord
	pairs: readonly TupleReferencePair[]
	uuids: readonly string[]
}

/** The records above each record held, by record id, outermost first, from the one below the root down to the IED. */
export type AncestriesById = ReadonlyMap<string, readonly AnyRawRecord[]>

/** A record held and the record the climb has reached above it. */
export type Climber = { startId: string; record: AnyRawRecord }

/** The address parts of each named target, by its uuid (`undefined` for one outside an IED). */
export type TargetPartsByUuid = ReadonlyMap<string, TupleTargetParts | undefined>
