import type { MappedLNodes } from '../resolve/resolve-mapped-lnodes.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** A data record the mapped-data rules address. */
export type DataRef = Scl.Ref<'DOS' | 'SDS' | 'DAS'>

/** A logical node the mapped-data rules answer. */
export type LnRef = Scl.Ref<'LN' | 'LN0'>

/** The records read for one call, by id: the roots, their subtrees and their ancestors. */
export type RecordsRead = ReadonlyMap<string, Scl.TrackedRecord<Scl.ElementsOf>>

/** What the rules source answers from: the records read, the LNodes resolved, the query for the logical nodes. */
export type RecordSourceParams = {
	query: Core.Query<Config>
	records: RecordsRead
	mappedLNodes: MappedLNodes
}

/** A root the data are read under: an LNode mapped to the logical node, or a data naming it. */
export type RootRecord =
	| Scl.TrackedRecord<'LNode'>
	| Scl.TrackedRecord<'DOS'>
	| Scl.TrackedRecord<'SDS'>

/** What is read under one root, by tag: the data and the `Private` they sit in. */
export type DataUnderRoot = Partial<Record<string, Scl.TrackedRecord<Scl.ElementsOf>[]>>
