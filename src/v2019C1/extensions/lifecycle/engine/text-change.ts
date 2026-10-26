import type { TextChange } from './diff.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The text of a matched element the template changed: compared on an element holding text only — no element child
 * on either side (a vendor `Private`, a `BayType`, an `IEDName`) —, its surrounding whitespace aside. `undefined`
 * when it holds the same text, or element children: their text is layout between them.
 */
export function textChangeOf(params: {
	sourceNode: AnyTreeRecord
	instanceNode: AnyTreeRecord
}): TextChange | undefined {
	const { sourceNode, instanceNode } = params
	if (sourceNode.tree.length > 0 || instanceNode.tree.length > 0) return undefined
	const before = instanceNode.value.trim()
	const after = sourceNode.value.trim()
	return before === after ? undefined : { before, after }
}
