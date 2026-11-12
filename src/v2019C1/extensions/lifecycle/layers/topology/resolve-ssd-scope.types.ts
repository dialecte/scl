import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { ROOT_ELEMENT } from '@/v2019C1/definition/constants.generated'

export type ResolveSsdScopeParams = {
	/**
	 * The element the consumer names: a named level is the scope, with the units it is linked to; the `TEMPLATE`
	 * scaffolding is walked down to the unit it holds. None: the walk starts at the file's substations.
	 */
	ref?: Scl.Ref<TopologyStructuralTag>
}

/** A unit of the template: a named level the consumer can name. */
export type SsdScopeUnit = {
	tagName: TopologyStructuralTag
	id: string
	name: string
}

/**
 * A unit of the template the consumer can name, listed when several elements could be instantiated and none is chosen,
 * with the units linked to it by a reference (`linked`): naming it places them together.
 */
export type SsdScopeCandidate = SsdScopeUnit & { linked: SsdScopeUnit[] }

/** What an SSD operation acts on. */
export type SsdScope = {
	/** The element it is rooted at: the unit, or the `TEMPLATE` scaffolding holding the linked units. */
	root: Scl.Ref<TopologyStructuralTag>
	/** The units it places or updates: one, or the units of the template linked to each other by references. */
	units: SsdScopeUnit[]
	/**
	 * The root is the `TEMPLATE` scaffolding of a group of linked units: it lands, as a level above a unit does, on the
	 * project's level of its kind.
	 */
	scaffolding: boolean
	/** The record ids under the root the operation leaves out: the units the group does not hold, and what they hold. */
	leftOut: ReadonlySet<string>
}

/** The element holding elements of the template: a level of the scaffolding, or the file's root for its substations. */
export type SsdScopeParent = {
	tagName: TopologyStructuralTag | typeof ROOT_ELEMENT
	id: string
	name?: string
}

/**
 * What {@link readSsdScope} reads: the scope (`scope`), the candidates when several elements could be instantiated
 * and none is chosen (`ambiguous`), nothing when nothing is named and the file holds no substation (`none`), the
 * element named that the file does not hold (`absent`), or a level of the scaffolding holding several elements
 * named `TEMPLATE`, which a valid file never holds (`duplicate-templates`).
 */
export type SsdScopeRead =
	| { kind: 'scope'; scope: SsdScope }
	| { kind: 'ambiguous'; candidates: SsdScopeCandidate[] }
	| { kind: 'none' }
	| { kind: 'absent'; ref: Scl.Ref<TopologyStructuralTag> }
	| { kind: 'duplicate-templates'; parent: SsdScopeParent; duplicates: SsdScopeUnit[] }
