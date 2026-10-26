import { requiredChildTags, requiresChildElement } from './requires-child-element'
import { isTopologyLevel } from './topology-levels'

import { REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'

import type { AnyDefinition } from '@dialecte/core'

/**
 * Whether an element is a container with no reason to stay once it holds none of the children its content model needs:
 * a list with no identity of its own (no key fields, no uuid), or a set of references (every child it needs is a
 * reference). A level of the topology never is.
 */
export function isEmptiableContainer(params: {
	tagName: string
	definition: AnyDefinition[string]
}): boolean {
	const { tagName, definition } = params
	if (isTopologyLevel(tagName) || !requiresChildElement(definition.contentModel)) return false
	const { identityFields = [], sequence } = definition.attributes
	if (identityFields.length === 0 && !sequence.includes('uuid')) return true
	return [...requiredChildTags(definition.contentModel)].every((child) =>
		REFERENCE_TAG_NAMES.has(child),
	)
}
