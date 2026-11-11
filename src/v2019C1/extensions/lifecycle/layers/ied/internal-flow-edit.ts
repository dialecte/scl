import { INTERNAL_SERVICE, SERVICES_KEPT_INSIDE } from './ied-process.constants'
import { linkTarget } from './link-target'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ProcessIndex } from './ied-process.types'
import type { SectionNode } from '@/v2019C1/extensions/dataflow/query/section-node.types'

/**
 * A specification of an input whose LNode and source LNode are both written LNodes of the IED: written as an internal
 * service, with no link to the input implementing it. A wired or already internal flow, and any other element, stay as
 * they are (`undefined`).
 */
export function internalFlowEdit(params: {
	node: SectionNode
	index: ProcessIndex
	lnodes: ReadonlySet<string>
}): Record<string, string | undefined> | undefined {
	const { node, index, lnodes } = params
	const { record } = node
	if (record.tagName !== 'SourceRef') return undefined
	const holder = node.ancestry.findLast(function isLNode(ancestor) {
		return ancestor.tagName === 'LNode'
	})
	if (!holder || !lnodes.has(holder.id)) return undefined
	const service = readAttribute({ record, name: 'service', defaults: 'none' })
	if (service && SERVICES_KEPT_INSIDE.has(service)) return undefined
	const attributes: Record<string, string | undefined> = { service: INTERNAL_SERVICE }
	for (const pair of UUID_REFERENCE_PAIRS.SourceRef) {
		const targets = pair.target as readonly string[]
		if (targets.includes('LNode')) {
			const source = linkTarget({ record, pair, index }).node
			if (!source || !lnodes.has(source.record.id)) return undefined
		}
		if (!targets.includes('ExtRef')) continue
		for (const name of [pair.attribute.uuid, pair.attribute.path])
			if (readAttribute({ record, name, defaults: 'none', fullObject: true }))
				attributes[name] = undefined
	}
	return attributes
}
