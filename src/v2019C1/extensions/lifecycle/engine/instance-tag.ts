import { INSTANCE_TAGS, TEMPLATE_TAGS } from './instance-tag.constants'

import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { AnyTreeRecord } from '@dialecte/core'

/** The tag an element of a template carries once instantiated — its own for any other element. */
export function instanceTagOf(tagName: string): string {
	return INSTANCE_TAGS[tagName] ?? tagName
}

/** Whether a source subtree holds an element that only exists in a template. */
export function holdsTemplateOnlyElement(tree: AnyTreeRecord): boolean {
	return tree.tagName in INSTANCE_TAGS || tree.tree.some(holdsTemplateOnlyElement)
}

/** The tag an element carries in a template with no parent level — its own for an element that is no function. */
export function templateTagOf(tagName: string): string {
	return TEMPLATE_TAGS[tagName] ?? tagName
}

/**
 * A source subtree as it is instantiated below `parentTagName`: every template-only element
 * carries the tag it becomes, and every element the namespace the schema declares for it where it
 * now sits — the content of a function template is in the template's namespace, the content of a
 * function is not.
 */
export function toInstanceTree<GenericTree extends AnyTreeRecord>(params: {
	tree: GenericTree
	parentTagName: string
}): GenericTree {
	return retagTree({ ...params, tagOf: instanceTagOf })
}

/**
 * A source subtree as it is written in a template with no parent level, below `parentTagName`: a function carries the
 * function template's tag, a subfunction the subfunction template's, and every element the namespace the schema
 * declares for it where it now sits (what a function template holds is in the template's namespace).
 */
export function toTemplateTree<GenericTree extends AnyTreeRecord>(params: {
	tree: GenericTree
	parentTagName: string
}): GenericTree {
	return retagTree({ ...params, tagOf: templateTagOf })
}

/** Every element of a subtree with the tag `tagOf` gives it, in the namespace declared for it below its new parent. */
function retagTree<GenericTree extends AnyTreeRecord>(params: {
	tree: GenericTree
	parentTagName: string
	tagOf: (tagName: string) => string
}): GenericTree {
	const { tree, parentTagName, tagOf } = params

	const tagName = tagOf(tree.tagName)
	// the declaration the new parent holds: a record without a namespace yet takes the one held there
	const declared = resolveDefinition({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		record: { tagName, parent: { id: '', tagName: parentTagName }, attributes: tree.attributes },
	})
	const namespace = declared?.namespace ?? tree.namespace

	return {
		...tree,
		tagName,
		namespace,
		tree: tree.tree.map((child) => retagTree({ tree: child, parentTagName: tagName, tagOf })),
	}
}
