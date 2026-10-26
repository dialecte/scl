import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'

export type ResolveSsdScopeParams = {
	/**
	 * The element the consumer names: a named level is the scope; the `TEMPLATE` scaffolding is walked down to the unit
	 * it holds. None: the walk starts at the file's substations.
	 */
	ref?: Scl.Ref<TopologyStructuralTag>
}

/** A unit of the template the consumer can name, listed when several are found and none is chosen. */
export type SsdScopeCandidate = {
	tagName: TopologyStructuralTag
	id: string
	name: string
}
