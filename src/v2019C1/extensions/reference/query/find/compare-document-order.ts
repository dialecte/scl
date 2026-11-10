import { CHILDREN } from '@/v2019C1/definition/constants.generated'

import type { AnyRawRecord } from '@dialecte/core'

/**
 * Which of two elements comes first, each given as its chain from the document root down to it:
 * negative for the first, positive for the second. Siblings are ordered as a read lays them out:
 * by the sequence the dialecte declares for the children of their parent, then in the order they
 * are stored.
 */
export function compareDocumentOrder(params: {
	first: readonly AnyRawRecord[]
	second: readonly AnyRawRecord[]
}): number {
	const { first, second } = params
	const depth = first.findIndex((record, index) => record.id !== second[index]?.id)
	if (depth <= 0) return first.length - second.length
	const parent = first[depth - 1]
	return (
		siblingRank({ parent, child: first[depth] }) - siblingRank({ parent, child: second[depth] })
	)
}

function siblingRank(params: { parent: AnyRawRecord; child: AnyRawRecord }): number {
	const { parent, child } = params
	const children: Readonly<Record<string, readonly string[] | undefined>> = CHILDREN
	const sequence = children[parent.tagName] ?? []
	const position = parent.children.findIndex((ref) => ref.id === child.id)
	return sequence.indexOf(child.tagName) * parent.children.length + position
}
