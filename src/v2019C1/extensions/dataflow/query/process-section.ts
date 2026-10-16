import { SIGNAL_FURTHER_TARGET_TAGS } from '../constants/signal-pairs.constants'
import { walkTree } from './walk-tree'

import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { ProcessSection } from './process-section.types'
import type { SectionNode, TreeNode } from './section-node.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Reads the process section once: one tree of every substation, line, process and function template, whatever their
 * depth (an LNode sits at many of them), and from it every map a dataflow query needs.
 */
export async function readProcessSection(query: Core.Query<Config>): Promise<ProcessSection> {
	const root = await query.getTree(
		{ tagName: 'SCL' },
		{ select: { Substation: true, Line: true, Process: true, FunctionTemplate: true } },
	)
	const lnodes = new Map<string, SectionNode<'LNode'>>()
	const specNamings = new Map<string, Core.AnyRawRecord>()
	const holderOfSignal = new Map<string, SectionNode<'LNode'>>()
	const uuidsByTag = new Map<string, Set<string>>()

	walkTree({
		nodes: (root?.tree ?? []) as readonly TreeNode[],
		visit(node) {
			const { record, ancestry } = node
			const nearestLNode = ancestry.findLast((ancestor) => ancestor.tagName === 'LNode')
			if (SIGNAL_FURTHER_TARGET_TAGS.has(record.tagName)) {
				const uuid = readRawAttribute({ record, name: 'uuid' })
				if (uuid)
					uuidsByTag.set(record.tagName, (uuidsByTag.get(record.tagName) ?? new Set()).add(uuid))
			}
			if (record.tagName === 'LNode') lnodes.set(record.id, node as SectionNode<'LNode'>)
			if (record.tagName === 'LNodeSpecNaming' && nearestLNode) {
				specNamings.set(nearestLNode.id, record)
			}
			if (SIGNAL_TAG_NAMES.has(record.tagName) && nearestLNode) {
				const holder = lnodes.get(nearestLNode.id)
				if (holder) holderOfSignal.set(record.id, holder)
			}
		},
	})

	return { ...indexLNodes({ lnodes, specNamings }), uuidsByTag, holderOfSignal }
}

/** The LNodes by uuid and by path; an LNode is named by its specified naming once an IED is assigned to it. */
function indexLNodes(params: {
	lnodes: ReadonlyMap<string, SectionNode<'LNode'>>
	specNamings: ReadonlyMap<string, Core.AnyRawRecord>
}): Pick<ProcessSection, 'lnodeByUuid' | 'lnodeByPath'> {
	const { lnodes, specNamings } = params
	const lnodeByUuid = new Map<string, SectionNode<'LNode'>>()
	const lnodeByPath = new Map<string, SectionNode<'LNode'>>()
	for (const lnode of lnodes.values()) {
		const uuid = readRawAttribute({ record: lnode.record, name: 'uuid' })
		if (uuid) lnodeByUuid.set(uuid, lnode)
		const path = buildPathFromAncestry({
			record: lnode.record,
			ancestry: lnode.ancestry,
			specNamings,
		})
		// the last of a path wins, as when a file is imported
		if (path) lnodeByPath.set(path.path, lnode)
	}
	return { lnodeByUuid, lnodeByPath }
}
