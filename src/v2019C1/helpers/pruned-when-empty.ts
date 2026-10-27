import { CHILD_REQUIRED_TAGS, NAMESPACE_WRAPPER_TYPES } from './pruned-when-empty.constants'
import { readAttribute } from './read-attributes'
import { isTransparentElement } from './transparent-elements'

import type { ReadAttributeParams } from './read-attributes.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Whether an element has no reason to stay once it holds nothing: one whose definition needs a child element, or a
 * transparent wrapper of the dialecte's own elements (`NAMESPACE_WRAPPER_TYPES`). A wrapper of another type is a
 * tool's private data, kept empty or not; a level of the topology is never one.
 */
export function isPrunedWhenEmpty(record: Scl.RawRecord<Scl.ElementsOf>): boolean {
	return CHILD_REQUIRED_TAGS.has(record.tagName) || isNamespaceWrapper({ record })
}

/**
 * Whether an element is a transparent wrapper of the dialecte's own elements: a `Private` whose `type` is a namespace
 * the dialecte declares (`NAMESPACE_WRAPPER_TYPES`), as opposed to a tool's private data.
 */
export function isNamespaceWrapper(params: { record: ReadAttributeParams['record'] }): boolean {
	const { record } = params
	if (!isTransparentElement(record.tagName)) return false
	const type = readAttribute({ record, name: 'type', defaults: 'none' })
	return type !== undefined && NAMESPACE_WRAPPER_TYPES.has(type)
}
