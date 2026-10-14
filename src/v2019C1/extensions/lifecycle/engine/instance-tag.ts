import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The elements that only exist in a template, and the element each becomes once instantiated: a
 * function template has no parent level and is placed as a function, wherever it is placed.
 */
const INSTANCE_TAGS: Readonly<Record<string, string>> = {
	FunctionTemplate: 'Function',
	SubFunctionTemplate: 'SubFunction',
}

/** The tag an element of a template carries once instantiated — its own for any other element. */
export function instanceTagOf(tagName: string): string {
	return INSTANCE_TAGS[tagName] ?? tagName
}

/** Whether a source subtree holds an element that only exists in a template. */
export function holdsTemplateOnlyElement(tree: AnyTreeRecord): boolean {
	return tree.tagName in INSTANCE_TAGS || tree.tree.some(holdsTemplateOnlyElement)
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
	const { tree, parentTagName } = params

	const tagName = instanceTagOf(tree.tagName)
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
		tree: tree.tree.map((child) => toInstanceTree({ tree: child, parentTagName: tagName })),
	}
}
