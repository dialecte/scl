import { findConstraintViolation } from './find-constraint-violation'

import type { ConstraintViolation } from './find-constraint-violation.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Validate a whole subtree against its parent context: walk the tree rooted at
 * `ref` and, for every element, check whether it violates a scoped-uniqueness
 * constraint declared on its parent (via {@link findConstraintViolation}). Returns
 * every violation found — the "check globally" seed of a future validation feature.
 *
 * The root itself is checked only when `parentRef` is given (its parent lives
 * outside the subtree); internal nodes are checked against their in-tree parent.
 */
export async function findConstraintViolations(
	query: Core.Query<Config>,
	params: { ref: Scl.Ref<Scl.ElementsOf>; parentRef?: Scl.Ref<Scl.ElementsOf> },
): Promise<ConstraintViolation[]> {
	const { ref, parentRef } = params
	const tree = await query.any.getTree(ref)
	if (!tree) return []

	const out: ConstraintViolation[] = []
	await walk(query, { node: tree, parentRef, out })
	return out
}

async function walk(
	query: Core.Query<Config>,
	params: {
		node: AnyTreeRecord
		parentRef: Scl.Ref<Scl.ElementsOf> | undefined
		out: ConstraintViolation[]
	},
): Promise<void> {
	const { node, parentRef, out } = params

	if (parentRef) {
		const violation = await findConstraintViolation(query, {
			parentRef,
			childTag: node.tagName,
			candidate: attributesRecord(node),
			excludeId: node.id,
		})
		if (violation) out.push(violation)
	}

	const childParent = { tagName: node.tagName, id: node.id } as Scl.Ref<Scl.ElementsOf>
	for (const child of node.tree) await walk(query, { node: child, parentRef: childParent, out })
}

function attributesRecord(node: AnyTreeRecord): Record<string, string> {
	const record: Record<string, string> = {}
	for (const attribute of node.attributes) record[attribute.name] = attribute.value
	return record
}
