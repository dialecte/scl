import {
	buildPairsByRefMap,
	buildResolutionsToTargetRefsMap,
	buildTypeIdReferrersByTarget,
} from './helpers'
import { RESOLUTION_TYPE } from './resolution-types'
import { TYPE_ID_REFERENCE_PAIRS } from './type-id-pairs'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { DEFINITION } from '@/v2019C1/definition/definition.generated'

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
 * Refs whose path attribute is a mapped data path: the path to the implementing data inside
 * the logical node named by the uuid attribute, stored only when the record is not
 * implemented by its default. Not a rebuildable path to the target element. Maps ref tag →
 * its `{ path, uuid }` attribute names. Derived from UUID_REFERENCE_PAIRS so DOS/SDS
 * (`mappedDoName`) and DAS (`mappedDaName`) stay in one source.
 */
export const MAPPED_NAME_REFS: ReadonlyMap<string, { path: string; uuid: string }> = new Map(
	Object.entries(UUID_REFERENCE_PAIRS).flatMap(([refTag, pairs]) =>
		pairs
			.filter(
				(pair) => pair.attribute.path === 'mappedDoName' || pair.attribute.path === 'mappedDaName',
			)
			.map((pair) => [refTag, { path: pair.attribute.path, uuid: pair.attribute.uuid }] as const),
	),
)

/**
 * Per tag, the attributes whose change moves the default implementation of the `DOS` / `SDS` /
 * `DAS` below a record: the `LNode` identity and its `lnUuid` (the logical node it is mapped
 * to), and a parent data's name, array index and own mapped attributes.
 */
export const MAPPED_DATA_DEFAULT_ATTRIBUTES: ReadonlyMap<string, readonly string[]> =
	buildMappedDataDefaultAttributes()

/**
 * The schema patterns of each mapped-name attribute (`mappedDoName` / `mappedDaName`), per
 * ref tag, each anchored to the whole value. A value must match all of them; a data path that
 * does not cannot be stored. Read from the definition.
 */
export const MAPPED_NAME_PATTERNS: ReadonlyMap<string, readonly RegExp[]> = new Map(
	[...MAPPED_NAME_REFS].map(([refTag, attributeNames]) => {
		const definition = DEFINITION as Record<
			string,
			{
				attributes?: {
					details?: Record<string, { facets?: { pattern?: readonly string[] } }>
				}
			}
		>
		const patterns =
			definition[refTag]?.attributes?.details?.[attributeNames.path]?.facets?.pattern ?? []
		return [refTag, patterns.map((pattern) => new RegExp(`^(?:${pattern})$`))] as const
	}),
)

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

/**
 * The attributes an LNode locked (implemented) in an IED owns: its schema identity
 * tuple (`iedName/ldInst/prefix/lnClass/lnInst`) plus its type reference (`lnType`).
 * A lifecycle reconcile must never overwrite these on a locked LNode. Derived from
 * the schema `identityFields` and the type-id reference registry.
 */
export const LOCKED_LNODE_ATTRIBUTES: ReadonlySet<string> = new Set<string>([
	...((DEFINITION as Record<string, { attributes?: { identityFields?: readonly string[] } }>).LNode
		?.attributes?.identityFields ?? []),
	...(TYPE_ID_REF_ATTRIBUTES.get('LNode') ?? []),
])

function buildMappedDataDefaultAttributes(): Map<string, readonly string[]> {
	const lnodeIdentity =
		(DEFINITION as Record<string, { attributes?: { identityFields?: readonly string[] } }>).LNode
			?.attributes?.identityFields ?? []
	const entries: [string, readonly string[]][] = [['LNode', [...lnodeIdentity, 'lnUuid']]]
	for (const tagName of ['DOS', 'SDS']) {
		const attributeNames = MAPPED_NAME_REFS.get(tagName)
		if (attributeNames) {
			entries.push([tagName, ['name', 'ix', attributeNames.path, attributeNames.uuid]])
		}
	}
	return new Map(entries)
}
