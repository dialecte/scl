import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { RESOLUTION_TARGET_REFS } from '@/v2019C1/extensions/reference/constants/derived'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants/resolution-types'

import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { DiffChange, OtherIedImpact } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** The input that subscribes to data a control block sends. */
export const SUBSCRIBED_INPUT_TAG = 'ExtRef'

/**
 * What a reference waiting for a decision on data the update deletes undergoes in another IED, by its change; none for
 * a change that does not write it. Every change named, so a new one is decided here.
 */
export const IMPACT_BY_CHANGE: Record<DiffChange, OtherIedImpact['effect'] | undefined> = {
	added: undefined,
	removed: 'deleted',
	modified: 'cleared',
	moved: undefined,
	unchanged: undefined,
	'target-only': undefined,
}

/** The changes that take an entry out of its data set once accepted: removed, or the project's kept unless removed. */
export const LEAVING_CHANGES: ReadonlySet<DiffChange> = new Set<DiffChange>([
	'removed',
	'target-only',
])

/**
 * The references whose names follow an element they name by uuid when it is renamed, with the uuid attributes they name
 * it by: every tuple reference of the registry but an LNode's (its binding is the process section's, never another
 * IED's).
 */
export const RENAME_FOLLOWING_REFERRERS: ReadonlyMap<string, readonly string[]> = new Map(
	Object.entries(TUPLE_REFERENCE_PAIRS).flatMap(([tagName, pairs]): [string, string[]][] =>
		tagName === 'LNode'
			? []
			: [[tagName, (pairs as readonly TupleReferencePair[]).map((pair) => pair.attribute.uuid)]],
	),
)

/** The resolutions whose path names its target from the top: such a path follows the target when it moves. */
const FULL_PATH_RESOLUTIONS = [RESOLUTION_TYPE.direct, RESOLUTION_TYPE.lnode] as const

/**
 * The references naming an element of the substation by a full path, with the uuid attributes they name it by: their
 * path follows when an update moves what they name, or what holds it (a primary of an IED's specification).
 */
export const MOVE_FOLLOWING_REFERRERS: ReadonlyMap<string, readonly string[]> =
	FULL_PATH_RESOLUTIONS.flatMap((resolution) =>
		[...RESOLUTION_TARGET_REFS[resolution].values()].flat(),
	).reduce(function byReferrerTag(byTag, entry) {
		byTag.set(entry.refTagName, [
			...new Set([...(byTag.get(entry.refTagName) ?? []), entry.uuidAttr]),
		])
		return byTag
	}, new Map<string, string[]>())

/** The elements a full-path reference names: what is read under a moved primary for their uuids. */
export const MOVE_FOLLOWING_TARGETS: ReadonlySet<string> = new Set(
	FULL_PATH_RESOLUTIONS.flatMap((resolution) => [...RESOLUTION_TARGET_REFS[resolution].keys()]),
)
