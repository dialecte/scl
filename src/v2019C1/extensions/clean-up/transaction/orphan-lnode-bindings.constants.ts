import { IMPLEMENTATION_PAIRS_BY_REF } from '@/v2019C1/extensions/dataflow/constants/implementation-targets.constants'
import { LNODE_BINDING_ATTRIBUTES } from '@/v2019C1/extensions/reference/constants'

/**
 * Per tag, the attributes the clean-up judges: an `LNode`'s binding (its naming and `lnUuid`), the
 * uuid of each reference of its data and signals. An element none of them changed on gives nothing
 * new to judge.
 */
export const JUDGED_ATTRIBUTES_BY_TAG: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	['LNode', new Set(LNODE_BINDING_ATTRIBUTES)],
	...[...IMPLEMENTATION_PAIRS_BY_REF].map(
		([tagName, pairs]) =>
			[tagName, new Set(pairs.map((pair) => pair.attribute.uuid))] as [string, ReadonlySet<string>],
	),
])
