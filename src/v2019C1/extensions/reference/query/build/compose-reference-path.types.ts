import type { ElementPath, PathSegmentWithRef } from './path-segment.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference'

/**
 * What a reference path is built from, however it was read: through a query (the record hooks)
 * or from the records an import streams (the import hooks).
 */
export type ReferencePathParts = {
	/** The pair of the reference whose path is built. */
	pair: ReferencePair
	/** The reference's own attributes: its companions (DO / DA names) and its current path. */
	referenceAttributes: readonly { name: string; value: string }[]
	/** The path of the element the reference points at. */
	targetPath: ElementPath
	/** `behavior-description` pairs only: the path segments of the BehaviorDescription's parent. */
	behaviorContext?: readonly PathSegmentWithRef[]
	/** `ied-address` pairs only: where the referrer's LNode is mapped. */
	referrerContext?: ReferrerContext
}

/** What an `ied-address` path reads of the referrer: the logical node its LNode is mapped to. */
export type ReferrerContext = {
	/** The path of the logical node implementing the referrer's LNode; `null` when it is not mapped. */
	mappedLnPath: string | null
}
