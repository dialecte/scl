import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { LN_TARGETS } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnode.constants'

import type { ReferencePair } from '@/v2019C1/extensions/reference/constants'

/**
 * Per referrer tag, its references to what implements an LNode in a device: the logical node its
 * data is mapped to (`DOS` / `SDS` / `DAS`), the ExtRef / ExtCtrl its signals name (`SourceRef` /
 * `ControlRef`). Read from the reference registry.
 */
export const IMPLEMENTATION_PAIRS_BY_REF: ReadonlyMap<string, readonly ReferencePair[]> = new Map(
	Object.entries(UUID_REFERENCE_PAIRS).flatMap(([tagName, pairs]) => {
		const implementation = (pairs as readonly ReferencePair[]).filter(namesImplementation)
		return implementation.length > 0 ? [[tagName, implementation] as const] : []
	}),
)

/** The elements those references point at, and the logical nodes an LNode is bound to. */
export const IMPLEMENTATION_TARGET_TAGS: ReadonlySet<string> = new Set([
	...LN_TARGETS,
	...[...IMPLEMENTATION_PAIRS_BY_REF.values()].flatMap((pairs) =>
		pairs.flatMap((pair) => pair.target),
	),
])

function namesImplementation(pair: ReferencePair): boolean {
	return (
		pair.resolution === RESOLUTION_TYPE.iedAddress ||
		pair.target.every((tagName) => LN_TARGETS.has(tagName))
	)
}
