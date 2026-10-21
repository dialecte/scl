import { DERIVED_ATTRIBUTES_BY_TAG } from '@/v2019C1/extensions/reference/constants'

import type { ElementPath } from './path-segment.types'
import type {
	DerivedAttribute,
	DerivedAttributes,
	DerivedAttributeValue,
} from '@/v2019C1/extensions/reference'

/**
 * The values of `derived` read on `sourcePath`. Pure: the record hooks read the path through a
 * query, the import hooks from the records they stream.
 */
export function composeDerivedAttributes(params: {
	derived: DerivedAttributes
	sourcePath: ElementPath
}): DerivedAttributeValue[] {
	const { derived, sourcePath } = params
	return derived.attributes.map((attribute) => ({
		name: attribute.name,
		value: valueOnPath({ attribute, sourcePath }),
	}))
}

/**
 * The attributes an element writes from the path of the target of its pair whose path attribute
 * is `follows` (or from its own path, with `'self'`).
 */
export function derivedAttributesFollowing(params: {
	tagName: string
	follows: string
}): DerivedAttributes | undefined {
	const { tagName, follows } = params
	const derived = DERIVED_ATTRIBUTES_BY_TAG.get(tagName)
	return derived?.follows === follows ? derived : undefined
}

/**
 * The value of `attribute` on `sourcePath`: the path, or the names of its levels of the tag it reads,
 * joined with "/". A `rootOnly` attribute reads its level only when that level starts the path.
 */
function valueOnPath(params: {
	attribute: DerivedAttribute
	sourcePath: ElementPath
}): string | undefined {
	const { attribute, sourcePath } = params
	if (attribute.from === 'path') return sourcePath.path
	if (attribute.rootOnly && sourcePath.segments[0]?.ref.tagName !== attribute.from) return undefined
	const names = sourcePath.segments
		.filter((segment) => segment.ref.tagName === attribute.from)
		.map((segment) => segment.segment)
	return names.length > 0 ? names.join('/') : undefined
}
