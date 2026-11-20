import { throwDialecteError } from '@dialecte/core'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { PARENTS } from '@/v2019C1/definition/constants.generated'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { PATH_PAIRS_BY_TAG } from '@/v2019C1/hooks/shared/path-references.constants'

import type { AddressNaming, ConnectionNaming, PlaceReadingRole } from './moves.types'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { ReferencePair } from '@/v2019C1/extensions/reference'

/** The resolutions whose path is read from the referrer's own place: a move may leave the target out of reach. */
const PLACE_DEPENDENT_RESOLUTIONS: ReadonlySet<string> = new Set([
	RESOLUTION_TYPE.ancestorName,
	RESOLUTION_TYPE.scopedName,
	RESOLUTION_TYPE.behaviorDescription,
])

/** The pairs of each path reference tag whose path is read from the referrer's own place (`PATH_PAIRS_BY_TAG`). */
export const PLACE_DEPENDENT_PAIRS_BY_TAG: ReadonlyMap<string, readonly ReferencePair[]> =
	placeDependentPairsByTag()

function placeDependentPairsByTag(): Map<string, ReferencePair[]> {
	const byTag = new Map<string, ReferencePair[]>()
	for (const [tagName, pairs] of PATH_PAIRS_BY_TAG) {
		for (const pair of pairs) {
			if (!PLACE_DEPENDENT_RESOLUTIONS.has(pair.resolution)) continue
			const held = byTag.get(tagName)
			if (held) held.push(pair)
			else byTag.set(tagName, [pair])
		}
	}
	return byTag
}

/** The tags those pairs may name. */
export const PLACE_DEPENDENT_TARGET_TAGS: ReadonlySet<string> = placeDependentTargetTags()

function placeDependentTargetTags(): Set<string> {
	const tags = new Set<string>()
	for (const pairs of PLACE_DEPENDENT_PAIRS_BY_TAG.values()) {
		for (const pair of pairs) for (const tagName of pair.target) tags.add(tagName)
	}
	return tags
}

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
/** The tuple reference registry, read as plain pairs by tag (one widening, no per-entry cast). */
const TUPLE_PAIRS_BY_TAG: Readonly<Record<string, readonly TupleReferencePair[]>> =
	TUPLE_REFERENCE_PAIRS

export const UNFOLLOWED_MOVE_TAGS: ReadonlySet<string> = unfollowedMoveTags()

function unfollowedMoveTags(): Set<string> {
	const tags = tagsOnlyBelowLogicalNodes()
	for (const pairs of Object.values(TUPLE_PAIRS_BY_TAG)) {
		for (const pair of pairs) for (const tagName of pair.target) tags.add(tagName)
	}
	return tags
}

/**
 * The tuple references that read the IED they name from their place (the registry's `tuple.ied`: the IED they sit in,
 * `ancestor`, or an attribute of their parent, `parentAttribute`), by tag: moved away from what they read it from, they
 * name another IED. A reference naming its IED outright (an LNode, a connected access point) moves as it is.
 */
export const PLACE_READING_REFERRERS: ReadonlyMap<string, PlaceReadingRole> =
	placeReadingReferrers()

function placeReadingReferrers(): Map<string, PlaceReadingRole> {
	const byTag = new Map<string, PlaceReadingRole>()
	for (const [tagName, pairs] of Object.entries(TUPLE_PAIRS_BY_TAG)) {
		for (const pair of pairs) {
			const { ied } = pair.tuple
			if ('parentAttribute' in ied) byTag.set(tagName, 'parent')
			else if ('ancestor' in ied && !byTag.has(tagName)) byTag.set(tagName, 'ied')
		}
	}
	return byTag
}

/** The tag of the element an `ancestor` IED role reads. */
export const IED_TAG = 'IED'

/**
 * The tuple targets a move within their own IED is followed for: what a tuple pair names by its logical node (`lnClass`)
 * or by its logical device alone (`lDevice`), never by a control block or an access point. Anything else moved within
 * the IED (a data instance, a data set, a control block) is named relative to its own logical node, not by a tuple, and
 * stays unfollowed.
 */
export const FOLLOWED_WITHIN_IED_TAGS: ReadonlySet<string> = followedWithinIedTags()

function followedWithinIedTags(): Set<string> {
	const tags = new Set<string>()
	for (const pairs of Object.values(TUPLE_PAIRS_BY_TAG)) {
		for (const pair of pairs) {
			const parts = Object.keys(pair.tuple)
			if (parts.includes('controlBlock') || parts.includes('accessPoint')) continue
			if (!parts.includes('lnClass') && !parts.includes('lDevice')) continue
			for (const tagName of pair.target) tags.add(tagName)
		}
	}
	return tags
}

/**
 * The address elements of each control block kind, by the control block's tag: the tuple references reading their IED
 * from their parent (a `GSE` / `SMV` under its connected access point) and naming a control block.
 */
export const ADDRESS_TAGS_BY_CONTROL_BLOCK: ReadonlyMap<string, readonly string[]> =
	addressTagsByControlBlock()

function addressTagsByControlBlock(): Map<string, string[]> {
	const byControlBlock = new Map<string, string[]>()
	for (const [tagName, pairs] of Object.entries(TUPLE_PAIRS_BY_TAG)) {
		for (const pair of pairs) {
			if (!('parentAttribute' in pair.tuple.ied) || !('controlBlock' in pair.tuple)) continue
			for (const target of pair.target) {
				byControlBlock.set(target, [...(byControlBlock.get(target) ?? []), tagName])
			}
		}
	}
	return byControlBlock
}

/** The tag of an access point, a logical device, and of the connection naming an access point on a subnetwork. */
export const ACCESS_POINT_TAG = 'AccessPoint'
export const LOGICAL_DEVICE_TAG = 'LDevice'
export const CONNECTED_ACCESS_POINT_TAG = 'ConnectedAP'

/** The attribute naming an element among its siblings: an access point, a control block, an IED. */
export const NAME_ATTRIBUTE = 'name'

/** The attribute naming a logical device in its IED. */
export const DEVICE_INST_ATTRIBUTE = 'inst'

/**
 * How a connection names its access point, read from the tuple registry: the uuid attribute, the attribute naming the
 * IED, the one naming the access point.
 */
export const CONNECTION_NAMING: ConnectionNaming = connectionNaming()

function connectionNaming(): ConnectionNaming {
	const [pair] = TUPLE_PAIRS_BY_TAG[CONNECTED_ACCESS_POINT_TAG] ?? []
	const { ied, accessPoint } = pair?.tuple ?? {}
	if (!pair || !ied || !('attribute' in ied) || !accessPoint) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: 'the tuple registry names no connected access point by IED and access point',
		})
	}
	return { uuid: pair.attribute.uuid, ied: ied.attribute, accessPoint }
}

/**
 * How each address tag names its control block, read from the tuple registry: the uuid attribute, the attribute naming
 * the logical device, the one naming the control block.
 */
export const ADDRESS_NAMING_BY_TAG: ReadonlyMap<string, AddressNaming> = addressNamingByTag()

function addressNamingByTag(): Map<string, AddressNaming> {
	const byTag = new Map<string, AddressNaming>()
	for (const tags of ADDRESS_TAGS_BY_CONTROL_BLOCK.values()) {
		for (const tagName of tags) {
			const [pair] = TUPLE_PAIRS_BY_TAG[tagName] ?? []
			const { lDevice, controlBlock } = pair?.tuple ?? {}
			if (pair && lDevice && controlBlock) {
				byTag.set(tagName, { uuid: pair.attribute.uuid, lDevice, controlBlock })
			}
		}
	}
	return byTag
}

/** A log control naming its log by its own device when it carries no `ldInst`. */
export const LOG_CONTROL_TAG = 'LogControl'
export const LOG_DEVICE_ATTRIBUTE = 'ldInst'
