import type {
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
