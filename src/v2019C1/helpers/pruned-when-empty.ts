import {
	CHILD_REQUIRED_TAGS,
	EMPTIED_ELEMENT_TAGS,
	IDENTIFIED_TAGS,
	NAMESPACE_WRAPPER_TYPES,
	REQUIRED_CHILD_GROUPS_BY_TAG,
} from './pruned-when-empty.constants'
import { readAttribute } from './read-attributes'
import { isOwnTransparentElement } from './transparent-elements'

import type { EmptiedRule, EmptiedRuleParams } from './pruned-when-empty.types'
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
 * the clean-up, read from its content model (`REQUIRED_CHILD_GROUPS_BY_TAG`): it has no reason to stay when empty
 * (`isPrunedWhenEmpty`), and it holds nothing but what is gone, or it lost every child of a group it requires and keeps
 * nothing with an identity of its own (a `Server` its last `LDevice`, its `Authentication` left; a `DataSet` its last
 * `FCDA`; a `SubNetwork` its last `ConnectedAP`). An element with an identity of its own that is not such a container
 * stays, whatever it lost (an `Application` its last `FunctionRole`). `removed` are the children the transaction already
 * took out of `record` (deleted, or moved away: not staying, even when the record read still lists them). Given nothing
 * gone or removed, only a container holding nothing goes.
 */
export function isEmptiedContainer(params: EmptiedRuleParams): boolean {
	return emptiedRule(params) !== undefined
}

/**
 * Which rule of {@link isEmptiedContainer} removes a container: it holds nothing but what is gone (`holds-nothing`), or
 * it lost every child of a group its content model requires (`lost-required`, the group's tags); `undefined` when it
 * stays.
 */
export function emptiedRule(params: EmptiedRuleParams): EmptiedRule | undefined {
	const { record, gone, removed = [] } = params
	if (!record.parent || !isPrunedWhenEmpty(record)) return undefined
	if (holdsNothingBut({ record, gone })) return { rule: 'holds-nothing' }
	const takenOut = new Set(removed.flatMap((child) => (child.id ? [child.id] : [])))
	const staying = record.children.filter((child) => !gone.has(child.id) && !takenOut.has(child.id))
	if (staying.some((child) => IDENTIFIED_TAGS.has(child.tagName))) return undefined
	const [lost] = lostRequiredGroups({ record, staying, removed })
	return lost ? { rule: 'lost-required', group: [...lost] } : undefined
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
 * The groups of children a record's content model requires of which it held one (in `record`, or `removed`) and keeps
 * none in `staying`: one branch of a choice staying keeps its group.
 */
function lostRequiredGroups(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	staying: readonly { tagName: string }[]
	removed: readonly { tagName: string }[]
}): ReadonlySet<string>[] {
	const { record, staying, removed } = params
	const groups = REQUIRED_CHILD_GROUPS_BY_TAG.get(record.tagName) ?? []
	return groups.filter(
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
export function isNamespaceWrapper(params: {
	record: ReadAttributeParams['record'] & { tagName: string; namespace: { uri: string } }
}): boolean {
	const { record } = params
	// a vendor's Private of another namespace is its own element, whatever its type
	if (!isOwnTransparentElement({ record })) return false
	const type = readAttribute({ record, name: 'type', defaults: 'none' })
	return type !== undefined && NAMESPACE_WRAPPER_TYPES.has(type)
}
