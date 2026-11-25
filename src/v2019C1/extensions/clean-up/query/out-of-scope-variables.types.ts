import type { Scl } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { PathSegmentWithRef } from '@/v2019C1/extensions/reference/query/build'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * A stored behaviour variable (`InputVar`, `OutputVar`) whose uuid names an element out of its behaviour's reach: the
 * variable, the uuid attribute of the pair, the element it names, and its counterpart in reach when exactly one
 * element there shares that element's template lineage.
 */
export type OutOfScopeVariable = {
	variable: Scl.Ref<Scl.ElementsOf>
	uuidAttribute: string
	target: Scl.Ref<Scl.ElementsOf>
	counterpart?: { ref: Scl.Ref<Scl.ElementsOf>; uuid: string }
}

/** A behaviour variable's pair holding its uuid, the element that uuid names, and the reach of its behaviour. */
export type OutOfReach = {
	record: AnyRawRecord
	pair: ReferencePair
	target: AnyRawRecord
	reach: readonly PathSegmentWithRef[]
}

/** A variable out of reach as the repair writes it: its record, its pair, its target and its counterpart in reach. */
export type ListedVariable = {
	record: AnyRawRecord
	pair: ReferencePair
	target: AnyRawRecord
	counterpart: AnyRawRecord | undefined
}
