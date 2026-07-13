import {
	buildPairsByRefMap,
	buildResolutionsToTargetRefsMap,
	buildTypeIdReferrersByTarget,
} from './helpers'
import { RESOLUTION_TYPE } from './resolution-types'
import { TYPE_ID_REFERENCE_PAIRS } from './type-id-pairs'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { TypeIdTarget, TypeIdReferrer } from './types'

/**
 * Maps each resolution strategy to a map of target tagName -> RefEntry[].
 *
 * Built once at module load from UUID_REFERENCE_PAIRS.
 * Use to look up which referrer elements point to a given target under a given strategy.
 *
 * @example
 * const entries = RESOLUTION_TARGET_REFS['direct'].get('Function') ?? []
 */
export const RESOLUTION_TARGET_REFS = buildResolutionsToTargetRefsMap(UUID_REFERENCE_PAIRS)

/**
 * Resolution types that produce a computable path value.
 * Excludes 'unsupported' which requires context not available at resolution time.
 */
export const RESOLVABLE_RESOLUTIONS = [
	RESOLUTION_TYPE.direct,
	RESOLUTION_TYPE.lnode,
	RESOLUTION_TYPE.iedAddress,
	RESOLUTION_TYPE.behaviorDescription,
] as const

/**
 * All resolution strategies, including 'unsupported'. UUID-based discovery of a
 * referrer is INDEPENDENT of path resolvability: a ref carries a uuid attribute
 * even when its path string cannot be built. Use this (not RESOLVABLE_RESOLUTIONS)
 * to find referrers by uuid; use RESOLVABLE_RESOLUTIONS only for path building.
 */
export const ALL_RESOLUTIONS = [...RESOLVABLE_RESOLUTIONS, RESOLUTION_TYPE.unsupported] as const

/**
 * Maps ref tagName -> list of its UUID pair entries (flattened).
 * Use for ref-side lookups (afterCreated REF case, beforeDelete sweeps).
 */
export const PAIRS_BY_REF = buildPairsByRefMap(UUID_REFERENCE_PAIRS)

/**
 * All uuid attribute names from UUID_REFERENCE_PAIRS, deduplicated.
 * Use as the attribute list for remapUuidAttrs so new ref pairs are automatically covered.
 */
export const ALL_REF_UUID_ATTRIBUTES: readonly string[] = [
	...new Set(
		Object.values(UUID_REFERENCE_PAIRS).flatMap((pairs) =>
			pairs.map((pair) => pair.attribute.uuid),
		),
	),
]

// ── Type-id reference derived structures ────────────────────────────────────────

/** Distinct attribute names that can carry a type id, per referrer tag. */
export const TYPE_ID_REF_ATTRIBUTES: ReadonlyMap<string, readonly string[]> = new Map(
	Object.entries(TYPE_ID_REFERENCE_PAIRS).map(([tag, pairs]) => [
		tag,
		[...new Set(pairs.map((pair) => pair.attribute))],
	]),
)

/** Reverse index: target type tag → the referrers (refTag + attribute) pointing at it. */
export const TYPE_ID_REFERRERS_BY_TARGET: ReadonlyMap<TypeIdTarget, readonly TypeIdReferrer[]> =
	buildTypeIdReferrersByTarget(TYPE_ID_REFERENCE_PAIRS)

/** All DataTypeTemplates type tags that are targets of a type-id reference. */
export const TYPE_ID_TARGET_TAGS: ReadonlySet<string> = new Set(TYPE_ID_REFERRERS_BY_TARGET.keys())
