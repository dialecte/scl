import { toRawRecord } from '@dialecte/core/helpers'

import type { SectionNode, TreeNode } from './section-node.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Visits every node of the trees, a parent before its children, with the records above it. One pass
 * over what a single `getTree` read, whatever the number of elements.
 */
export function walkTree(params: {
	nodes: readonly TreeNode[]
	ancestry?: readonly AnyRawRecord[]
	visit: (node: SectionNode) => void
}): void {
	const { nodes, ancestry = [], visit } = params
	for (const node of nodes) {
		const record = toRawRecord(node)
		visit({
			ref: { tagName: record.tagName, id: record.id } as SectionNode['ref'],
			record,
			ancestry,
		})
		walkTree({ nodes: node.tree as readonly TreeNode[], ancestry: [...ancestry, record], visit })
	}
}
