import type { Scl } from '@/v2019C1/config'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * How a shared element of the project is recognised as the one a source element stands for.
 * Declared by the layer that owns the element.
 */
export type MappingPolicy = {
	tagName: Scl.ElementsOf
	/** The attribute a source element and a project element share when they are the same thing. */
	key: 'name'
}

/** Why a source element was mapped the way it was. */
export type MappingReason = 'name' | 'none'

/** Where a shared source element lands in the project. */
export type ResolvedMapping = {
	/** The project element the source element maps onto. Absent: a new element is created. */
	existing?: AnyTrackedRecord
	reason: MappingReason
	/** Several project elements qualified equally, so none was picked. */
	ambiguous: boolean
}
