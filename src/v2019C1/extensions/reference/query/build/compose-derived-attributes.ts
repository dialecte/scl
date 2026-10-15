import { DERIVED_ATTRIBUTES_BY_TAG } from '@/v2019C1/extensions/reference/constants'

import type { ElementPath } from './path-segment.types'
import type {
	DerivedAttributes,
	DerivedAttributeSource,
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
		value: valueOnPath({ from: attribute.from, sourcePath }),
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

function valueOnPath(params: {
	from: DerivedAttributeSource
	sourcePath: ElementPath
}): string | undefined {
	const { from, sourcePath } = params
	if (from === 'path') return sourcePath.path
	const names = sourcePath.segments
		.filter((segment) => segment.ref.tagName === from)
		.map((segment) => segment.segment)
	return names.length > 0 ? names.join('/') : undefined
}
