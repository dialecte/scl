import { SPECIFIED_IED_NAME_ATTRIBUTE } from '@/v2019C1/constants/lnode-spec-naming'
import { IMPLEMENTATION_PAIRS_BY_REF } from '@/v2019C1/extensions/clean-up/transaction/orphan-lnode-bindings.constants'
import {
	isAssignedToIed,
	unassignedNaming,
} from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { readAttributes } from '@/v2019C1/helpers'

import type { CopyUnbind, CopyWrite, PlanCopyUnbindsParams } from './copy.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The LNodes of a copy released from the IED that does not travel with it, as a plan the report lists and the apply
 * writes: a bound LNode unassigned (`iedName` `None`, `ldInst` and `lnUuid` removed, its prefix, class and instance as
 * its `LNodeSpecNaming` gives them — what the commit would complete them with), the specification IED its
 * `LNodeSpecNaming` names removed (its logical device kept), and the references of its implementation it holds cleared
 * (path, uuid and companions together). Pure: read from the source trees the copy is made of, in document order.
 */
export function planCopyUnbinds(params: PlanCopyUnbindsParams): CopyUnbind[] {
	return params.trees.flatMap(collectLNodes).flatMap(planLNodeUnbind)
}

/** The plan of one LNode: none when it is bound to nothing, specified on no IED and implements nothing. */
function planLNodeUnbind(lnode: AnyTreeRecord): CopyUnbind[] {
	const held = descendantsOf(lnode)
	const specNaming = held.find((record) => record.tagName === 'LNodeSpecNaming')
	const lnodeAttributes = readAttributes({ record: lnode, defaults: 'none' })
	const specifiedAttributes = specNaming
		? readAttributes({ record: specNaming, defaults: 'none' })
		: undefined
	const bound = isAssignedToIed({ iedName: lnodeAttributes.iedName })
	const references = held.flatMap(releasedImplementation)
	const specifiedOnAnIed = Boolean(specifiedAttributes?.[SPECIFIED_IED_NAME_ATTRIBUTE])
	if (!bound && !specifiedOnAnIed && references.length === 0) return []
	const desired = bound
		? {
				...unassignedNaming({ lnodeAttributes, specifiedAttributes }),
				ldInst: undefined,
				lnUuid: undefined,
			}
		: {}
	const unbind: CopyUnbind = {
		lnode: difference({ record: lnode, current: lnodeAttributes, desired }),
		references,
	}
	if (specNaming && specifiedAttributes && specifiedOnAnIed) {
		unbind.specNaming = difference({
			record: specNaming,
			current: specifiedAttributes,
			desired: { [SPECIFIED_IED_NAME_ATTRIBUTE]: undefined },
		})
	}
	return [unbind]
}

/** The LNodes of a tree, in document order. */
function collectLNodes(node: AnyTreeRecord): AnyTreeRecord[] {
	if (node.tagName === 'LNode') return [node]
	return node.tree.flatMap(collectLNodes)
}

/** What a record holds, at every depth, in document order. */
function descendantsOf(node: AnyTreeRecord): AnyTreeRecord[] {
	return node.tree.flatMap((child) => [child, ...descendantsOf(child)])
}

/** A reference of the implementation a record holds, every pair it carries cleared with its companions. */
function releasedImplementation(record: AnyTreeRecord): CopyWrite[] {
	const pairs = IMPLEMENTATION_PAIRS_BY_REF.get(record.tagName)
	if (!pairs) return []
	const current = readAttributes({ record, defaults: 'none' })
	const desired: Record<string, undefined> = {}
	for (const pair of pairs) {
		desired[pair.attribute.uuid] = undefined
		desired[pair.attribute.path] = undefined
		for (const companion of pair.companions) desired[companion.name] = undefined
	}
	const write = difference({ record, current, desired })
	return write.removed.length > 0 ? [write] : []
}

/** What writing `desired` over `current` changes: the values that differ, the attributes held that go. */
function difference(params: {
	record: AnyTreeRecord
	current: Readonly<Record<string, string | undefined>>
	desired: Readonly<Record<string, string | undefined>>
}): CopyWrite {
	const { record, current, desired } = params
	const written: Record<string, string> = {}
	const removed: string[] = []
	for (const [name, value] of Object.entries(desired)) {
		const held = current[name] || undefined
		if (value === undefined) {
			if (held !== undefined) removed.push(name)
			continue
		}
		if (held !== value) written[name] = value
	}
	return { element: { tagName: record.tagName, id: record.id }, written, removed: removed.sort() }
}
