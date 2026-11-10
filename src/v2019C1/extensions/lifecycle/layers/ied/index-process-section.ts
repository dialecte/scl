import { PROCESS_ROOT_TAGS } from './ied-process.constants'

import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readAttribute } from '@/v2019C1/helpers'

import type { ProcessIndex } from './ied-process.types'
import type { ProcessSection } from '@/v2019C1/extensions/dataflow/query/process-section.types'
import type { SectionNode } from '@/v2019C1/extensions/dataflow/query/section-node.types'

/**
 * The process section laid out for planning an IED export, from the elements read: by id, by uuid (the first of a
 * uuid), by name path (an LNode by its specified naming, as the section names it), the children of each, and the roots
 * of the process part.
 */
export function indexProcessSection(section: ProcessSection): ProcessIndex {
	const byId = new Map<string, SectionNode>()
	const byUuid = new Map<string, SectionNode>()
	const byPath = new Map<string, SectionNode>()
	const childrenOf = new Map<string, SectionNode[]>()
	const roots: SectionNode[] = []
	for (const node of section.nodes) {
		const { record, ancestry } = node
		byId.set(record.id, node)
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		if (uuid && !byUuid.has(uuid)) byUuid.set(uuid, node)
		const path =
			record.tagName === 'LNode' ? undefined : buildPathFromAncestry({ record, ancestry })
		if (path && !byPath.has(path.path)) byPath.set(path.path, node)
		const parent = ancestry.at(-1)
		if (!parent) continue
		const siblings = childrenOf.get(parent.id)
		if (siblings) siblings.push(node)
		else childrenOf.set(parent.id, [node])
		if (ancestry.length === 1 && PROCESS_ROOT_TAGS.has(record.tagName)) roots.push(node)
	}
	for (const [path, lnode] of section.lnodeByPath) byPath.set(path, lnode)
	return { nodes: section.nodes, byId, byUuid, byPath, childrenOf, roots }
}
