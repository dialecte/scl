import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/** A reader with the untyped `.any` facade — either a Query or a Transaction. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * The record ids of the elements that belong to an instance: the elements of its subtree and the
 * elements its references point at. What tells the elements of one instance from those of another
 * instance of the same template.
 */
export async function collectInstanceScope(
	reader: Reader,
	instanceRootRef: AnyRefOrRecord,
): Promise<Set<string>> {
	const scope = new Set<string>()
	const instanceTree = await reader.any.getTree(instanceRootRef)
	if (instanceTree) await collectNodeScope(reader, { node: instanceTree, scope })
	return scope
}

async function collectNodeScope(
	reader: Reader,
	params: { node: AnyTreeRecord; scope: Set<string> },
): Promise<void> {
	const { node, scope } = params
	scope.add(node.id)

	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
	for (const pair of pairs) {
		const referencedUuid = await reader.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!referencedUuid) continue
		for (const tagName of pair.target) {
			const referenced = await reader.any.findByAttributes({
				tagName: tagName as Scl.ElementsOf,
				attributes: { uuid: referencedUuid },
			})
			for (const record of referenced) scope.add(record.id)
		}
	}

	for (const child of node.tree) await collectNodeScope(reader, { node: child, scope })
}
