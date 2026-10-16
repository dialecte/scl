import { toRef } from '@dialecte/core/helpers'

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
