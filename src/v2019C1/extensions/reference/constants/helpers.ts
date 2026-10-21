import type {
	DerivedAttribute,
	DerivedAttributes,
	UuidReferencePairs,
	ResolutionType,
	RefEntry,
	RefPairEntry,
	TypeIdReferencePair,
	TypeIdReferencePairs,
	TypeIdReferrer,
	TypeIdRefAttribute,
	TypeIdRefTagName,
	TypeIdTarget,
} from './types'
import type { IdentityConstraint } from '@dialecte/core'

export function buildResolutionsToTargetRefsMap(
	UUID_REFERENCE_PAIRS: UuidReferencePairs,
): Record<ResolutionType, Map<string, RefEntry[]>> {
	const result: Record<string, Map<string, RefEntry[]>> = {}

	for (const [refTagName, pairs] of Object.entries(UUID_REFERENCE_PAIRS)) {
		for (const pair of pairs) {
			const strategyMap = (result[pair.resolution] ??= new Map<string, RefEntry[]>())
			for (const targetTagName of pair.target) {
				const existing = strategyMap.get(targetTagName) ?? []
				existing.push({
					refTagName,
					uuidAttr: pair.attribute.uuid,
					pathAttr: pair.attribute.path,
				})
				strategyMap.set(targetTagName, existing)
			}
		}
	}
	return result
}

/**
 * Maps ref tagName -> list of its UUID pair entries (flattened for hook consumers).
 */
export function buildPairsByRefMap(
	UUID_REFERENCE_PAIRS: UuidReferencePairs,
): Map<string, RefPairEntry[]> {
	const map = new Map<string, RefPairEntry[]>()
	for (const [refTagName, pairs] of Object.entries(UUID_REFERENCE_PAIRS)) {
		map.set(
			refTagName,
			pairs.map((p) => ({
				uuidAttr: p.attribute.uuid,
				pathAttr: p.attribute.path,
				resolution: p.resolution,
				targetTagNames: p.target,
			})),
		)
	}
	return map
}

/** Reverse index: target type tag -> the referrers (refTag + attribute) pointing at it. */
export function buildTypeIdReferrersByTarget(
	TYPE_ID_REFERENCE_PAIRS: TypeIdReferencePairs,
): Map<TypeIdTarget, TypeIdReferrer[]> {
	const map = new Map<TypeIdTarget, TypeIdReferrer[]>()
	for (const [refTagName, pairs] of Object.entries(TYPE_ID_REFERENCE_PAIRS)) {
		for (const pair of pairs as readonly TypeIdReferencePair[]) {
			const existing = map.get(pair.target) ?? []
			existing.push({
				refTagName: refTagName as TypeIdRefTagName,
				attribute: pair.attribute as TypeIdRefAttribute,
				when: pair.when,
			})
			map.set(pair.target, existing)
		}
	}
	return map
}

/**
 * `derived` of `tagName`, each attribute marked `rootOnly` when the root element's constraints hold a
 * keyref reading it on `tagName` that refers to a key on the names of the root's children only: a
 * terminal's `substationName` must name a substation at the root, not one inside a process.
 */
export function markRootKeyedAttributes(params: {
	tagName: string
	derived: DerivedAttributes
	rootConstraints: readonly IdentityConstraint[]
}): DerivedAttributes {
	const { tagName, derived, rootConstraints } = params
	return {
		...derived,
		attributes: derived.attributes.map((attribute) =>
			isRootKeyed({ tagName, attribute, rootConstraints })
				? { ...attribute, rootOnly: true as const }
				: attribute,
		),
	}
}

function isRootKeyed(params: {
	tagName: string
	attribute: DerivedAttribute
	rootConstraints: readonly IdentityConstraint[]
}): boolean {
	const { rootConstraints } = params
	return rootConstraints.some((keyref) => refersToRootKey({ ...params, keyref }))
}

/**
 * Whether `keyref` reads `attribute` on `tagName` (its only field) and refers to a key of
 * `rootConstraints` selecting children of the root only, the level `attribute` reads among them.
 */
function refersToRootKey(params: {
	keyref: IdentityConstraint
	tagName: string
	attribute: DerivedAttribute
	rootConstraints: readonly IdentityConstraint[]
}): boolean {
	const { keyref, tagName, attribute, rootConstraints } = params
	if (keyref.kind !== 'keyref' || keyref.fields.length !== 1) return false
	const selectsTag = keyref.selector.some((path) => path.steps.at(-1)?.name === tagName)
	const readsAttribute = keyref.fields[0].some(
		(field) => field.steps.length === 0 && field.attribute?.name === attribute.name,
	)
	const key = rootConstraints.find(
		(constraint) => constraint.kind !== 'keyref' && constraint.name === keyref.refer?.name,
	)
	const keysRootChildren = key?.selector.every((path) => !path.deep && path.steps.length === 1)
	const keysLevel = key?.selector.some((path) => path.steps[0]?.name === attribute.from)
	return selectsTag && readsAttribute && keysRootChildren === true && keysLevel === true
}
