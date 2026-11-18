import { TUPLE_REFERENCE_PAIRS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { PARENTS } from '@/v2019C1/definition/constants.generated'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type { PlaceReadingRole } from './moves.types'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { ReferencePair } from '@/v2019C1/extensions/reference'

/** The resolutions whose path is read from the referrer's own place: a move may leave the target out of reach. */
const PLACE_DEPENDENT_RESOLUTIONS: ReadonlySet<string> = new Set([
	RESOLUTION_TYPE.ancestorName,
	RESOLUTION_TYPE.scopedName,
	RESOLUTION_TYPE.behaviorDescription,
])

/** The pairs of each reference tag whose path is read from the referrer's own place, from the registry. */
export const PLACE_DEPENDENT_PAIRS_BY_TAG: ReadonlyMap<string, readonly ReferencePair[]> = new Map(
	Object.entries(UUID_REFERENCE_PAIRS).flatMap(([tagName, pairs]): [string, ReferencePair[]][] => {
		const dependent = (pairs as readonly ReferencePair[]).filter((pair) =>
			PLACE_DEPENDENT_RESOLUTIONS.has(pair.resolution),
		)
		return dependent.length > 0 ? [[tagName, dependent]] : []
	}),
)

/** The tags those pairs may name. */
export const PLACE_DEPENDENT_TARGET_TAGS: ReadonlySet<string> = new Set(
	[...PLACE_DEPENDENT_PAIRS_BY_TAG.values()].flatMap((pairs) =>
		pairs.flatMap((pair) => pair.target),
	),
)

/** The attribute an element is named by in a reference. */
export const UUID_ATTRIBUTE = 'uuid'

/** The logical nodes: what sits only below them is named by its place in an IED's data model. */
const LOGICAL_NODE_TAGS: ReadonlySet<string> = new Set(['LN', 'LN0'])

/**
 * The tags the definition places only at or below a logical node: each parent is a logical node or such a tag (a
 * `DOI`, an `SDI`, a `DAI`, a `DataSet`, a control block), found to a fixpoint. A `Text` or a `Private`, which other
 * elements hold too, is not one.
 */
function tagsOnlyBelowLogicalNodes(): Set<string> {
	const parentsOf = PARENTS as Readonly<Record<string, readonly string[]>>
	const below = new Set<string>(LOGICAL_NODE_TAGS)
	let grew = true
	while (grew) {
		grew = false
		for (const [tagName, parents] of Object.entries(parentsOf)) {
			if (below.has(tagName) || parents.length === 0) continue
			if (parents.every((parent) => below.has(parent) || parent === tagName)) {
				below.add(tagName)
				grew = true
			}
		}
	}
	return below
}

/**
 * What a move does not follow yet, derived from the tuple registry and the definition: what tuple references name by
 * its place (each pair's `target`: a logical node, a logical device, an access point, a control block) and what the
 * definition places only below a logical node. A moved subtree holding one of them refuses the commit.
 */
export const UNFOLLOWED_MOVE_TAGS: ReadonlySet<string> = new Set([
	...Object.values(TUPLE_REFERENCE_PAIRS).flatMap((pairs) =>
		(pairs as readonly TupleReferencePair[]).flatMap((pair) => pair.target),
	),
	...tagsOnlyBelowLogicalNodes(),
])

/**
 * The tuple references that read the IED they name from their place (the registry's `tuple.ied`: the IED they sit in,
 * `ancestor`, or an attribute of their parent, `parentAttribute`), by tag: moved away from what they read it from, they
 * name another IED. A reference naming its IED outright (an LNode, a connected access point) moves as it is.
 */
export const PLACE_READING_REFERRERS: ReadonlyMap<string, PlaceReadingRole> = new Map(
	Object.entries(TUPLE_REFERENCE_PAIRS).flatMap(
		([tagName, pairs]): [string, PlaceReadingRole][] => {
			const ied = (pairs as readonly TupleReferencePair[]).map((pair) => pair.tuple.ied)
			if (ied.some((role) => 'parentAttribute' in role)) return [[tagName, 'parent']]
			if (ied.some((role) => 'ancestor' in role)) return [[tagName, 'ied']]
			return []
		},
	),
)

/** The tag of the element an `ancestor` IED role reads. */
export const IED_TAG = 'IED'
