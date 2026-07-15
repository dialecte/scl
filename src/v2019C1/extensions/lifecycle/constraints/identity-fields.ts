import { DEFINITION } from '@/v2019C1/definition/definition.generated'

/**
 * The identity attributes of `tag` — the schema's own `identityFields` list (the
 * attributes that identify the element within its context, e.g. `LNode` ->
 * iedName/ldInst/lnClass/lnInst/prefix; most named elements -> name). Reuses the
 * definition's curated identity list rather than re-deriving it from constraints.
 *
 * Used by attribute classification to mark intrinsic-identity attributes as
 * non-editable. Memoized per tag.
 */
const cache = new Map<string, ReadonlySet<string>>()

export function getIdentityFields(tag: string): ReadonlySet<string> {
	const cached = cache.get(tag)
	if (cached) return cached

	const fields =
		(DEFINITION as Record<string, { attributes?: { identityFields?: readonly string[] } }>)[tag]
			?.attributes?.identityFields ?? []
	const set = new Set(fields)
	cache.set(tag, set)
	return set
}
