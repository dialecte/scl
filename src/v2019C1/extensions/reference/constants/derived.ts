import { buildPairsByRefMap, buildResolutionsToTargetRefsMap } from './helpers'
import { RESOLUTION_TYPE, UUID_REFERENCE_PAIRS } from './pairs'

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
