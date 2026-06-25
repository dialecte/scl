import { TYPE_ID_TARGET_TAGS } from './constants'

import type { TypeIdTarget } from './constants'

/** Whether a tag is a DataTypeTemplates type element (target of a type-id reference). */
export function isTypeIdTarget(tagName: string): tagName is TypeIdTarget {
	return TYPE_ID_TARGET_TAGS.has(tagName)
}
