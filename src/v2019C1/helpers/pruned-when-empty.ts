import {
	CHILD_REQUIRED_TAGS,
	EMPTIED_ELEMENT_TAGS,
	IDENTIFIED_TAGS,
	NAMESPACE_WRAPPER_TYPES,
	REQUIRED_CHILD_GROUPS_BY_TAG,
} from './pruned-when-empty.constants'
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
	return (
		CHILD_REQUIRED_TAGS.has(record.tagName) ||
		EMPTIED_ELEMENT_TAGS.has(record.tagName) ||
		isNamespaceWrapper({ record })
	)
}

/**
 * Whether a container goes once everything in `gone` is gone, the one judge of the delete cascade, the commit's prune and
 * the clean-up: it has no reason to stay when empty (`isPrunedWhenEmpty`), and it holds nothing but what is gone, or it
 * lost the last of the children of a kind the schema requires there and keeps nothing with an identity of its own (a
 * `Server` its last `LDevice`, its `Authentication` left; a `DataSet` its last `FCDA`). `removed` are the children the
 * transaction already took out of `record` (a commit reads the record as staged). Given nothing gone or removed, only a
 * container holding nothing goes.
 */
export function isEmptiedContainer(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	gone: ReadonlySet<string>
	removed?: readonly { tagName: string }[]
}): boolean {
	const { record, gone, removed = [] } = params
	if (!isPrunedWhenEmpty(record)) return false
	return holdsNothingBut({ record, gone }) || lostLastRequiredChild({ record, gone, removed })
}

/** Whether a record, not the root, holds no text and no child but those in `gone`. */
export function holdsNothingBut(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	gone: ReadonlySet<string>
}): boolean {
	const { record, gone } = params
	if (!record.parent || record.value.trim() !== '') return false
	return record.children.every((child) => gone.has(child.id))
}

/**
 * Whether a record, not the root, lost every child of a group its content model requires (each gone, or `removed`:
 * one branch of a choice staying keeps the group) and keeps no child with an identity of its own.
 */
function lostLastRequiredChild(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	gone: ReadonlySet<string>
	removed: readonly { tagName: string }[]
}): boolean {
	const { record, gone, removed } = params
	if (!record.parent) return false
	const staying = record.children.filter((child) => !gone.has(child.id))
	if (staying.some((child) => IDENTIFIED_TAGS.has(child.tagName))) return false
	const groups = REQUIRED_CHILD_GROUPS_BY_TAG.get(record.tagName) ?? []
	return groups.some(
		(group) =>
			!staying.some((child) => group.has(child.tagName)) &&
			[...record.children, ...removed].some((child) => group.has(child.tagName)),
	)
}

/**
 * Whether an element is a transparent wrapper of the dialecte's own elements: a `Private` whose `type` is a namespace
 * the dialecte declares (`NAMESPACE_WRAPPER_TYPES`), as opposed to a tool's private data.
 *
 * @intent tell a namespace Private from a tool's private data, is this Private a wrapper of 6-100 elements, walk through a Private wrapper
 */
export function isNamespaceWrapper(params: { record: ReadAttributeParams['record'] }): boolean {
	const { record } = params
	if (!isTransparentElement(record.tagName)) return false
	const type = readAttribute({ record, name: 'type', defaults: 'none' })
	return type !== undefined && NAMESPACE_WRAPPER_TYPES.has(type)
}
