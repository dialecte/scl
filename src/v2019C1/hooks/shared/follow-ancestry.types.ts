import type { Scl } from '@/v2019C1/config'
import type { DerivedAttributeValue } from '@/v2019C1/extensions/reference'
import type { ElementPath } from '@/v2019C1/extensions/reference/query/build'
import type { AnyRawRecord } from '@dialecte/core'

/** A root whose path a change moved, and what of it the paths follow. */
export type FollowedRoot = {
	root: Scl.Ref<Scl.ElementsOf>
	/** The references to the root itself are rebuilt. */
	references: boolean
	/** The attributes the root writes from its own path (a node's `pathName`) are rebuilt. */
	ownPath: boolean
	/** Both, for every element below the root. */
	below: boolean
}

/**
 * An element whose path is followed, as read: the records above it (outermost first) and, for a signal, the children
 * of its parent, when they were read with it.
 */
export type FollowedElement = {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[] | undefined
	siblings: readonly AnyRawRecord[] | undefined
	references: boolean
	ownPath: boolean
}

/** A reference naming a followed element by its uuid. */
export type FollowedReferrer = {
	referrer: Scl.TrackedRecord<Scl.ElementsOf>
	target: FollowedElement
}

/** The path of each followed element, by id: `null` for one with no segment of its own. */
export type FollowedPaths = ReadonlyMap<string, ElementPath | null>

/** One search for the references of a tag naming followed elements through one uuid attribute. */
export type ReferrerSearch = {
	tagName: Scl.ElementsOf
	uuidAttribute: string
	/** The tags of the followed elements this attribute may name. */
	targetTags: ReadonlySet<string>
	/** The uuids sought, each once. */
	uuids: readonly string[]
}

/** The attributes one record takes from a path it follows. */
export type FollowedWrite = { record: AnyRawRecord; values: DerivedAttributeValue[] }
