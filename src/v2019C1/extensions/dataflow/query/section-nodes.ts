import { toRef } from '@dialecte/core/helpers'

import { isNativeStep } from '@/v2019C1/extensions/reference/query/find/is-native-step'

import type { SectionNode } from './section-node.types'
import type { CollectedWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'

/** The elements of a read subtree as section nodes: each with its ref and the records above it. */
export function sectionNodesOf(collected: CollectedWithAncestry): SectionNode[] {
	return collected.records.map((record) => ({
		ref: toRef(record) as SectionNode['ref'],
		record,
		ancestry: collected.ancestryOf(record.id),
	}))
}

/**
 * The elements of a read subtree that are the document's own content, as section nodes: vendor
 * payload and all it holds are left out. Each is judged once, against the record above it, the read
 * giving a parent before its children.
 */
export function nativeSectionNodesOf(collected: CollectedWithAncestry): SectionNode[] {
	const nativeIds = new Set<string>()
	const native: SectionNode[] = []
	for (const node of sectionNodesOf(collected)) {
		const { record, ancestry } = node
		const above = ancestry.at(-1)
		if (
			above &&
			!(nativeIds.has(above.id) && isNativeStep({ element: record, above, root: ancestry[0] }))
		)
			continue
		nativeIds.add(record.id)
		native.push(node)
	}
	return native
}
