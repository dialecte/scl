import { TYPE_ID_TARGET_TAGS } from './constants'

import type { TypeIdTarget } from './constants'

/**
 * Whether a tag is a DataTypeTemplates type element (target of a type-id reference); narrows the tag.
 *
 * @intent is this element a data type template, can a type reference point at this tag, filter LNodeType/DOType/DAType/EnumType elements
 */
export function isTypeIdTarget(tagName: string): tagName is TypeIdTarget {
	return TYPE_ID_TARGET_TAGS.has(tagName)
}
