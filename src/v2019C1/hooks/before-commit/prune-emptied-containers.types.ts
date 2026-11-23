import type { Scl } from '@/v2019C1/config'
import type { EmptiedRule } from '@/v2019C1/helpers/pruned-when-empty.types'
import type { NamedIdentity } from '@/v2019C1/hooks/shared/element-identity.types'

/** An element the commit pass judges, by its tag and record id. */
export type PruneCandidate = Scl.Ref<Scl.ElementsOf> & { id: string }

/** An element named by its tag and record id. */
export type PrunedElement = { tagName: Scl.ElementsOf; id: string }

/**
 * Why the commit removes a container: the transaction emptied it (it holds nothing, or lost every child of a group its
 * content model requires, that group named), or a container removed below it left it empty.
 */
export type PruneReason =
	| ({ kind: 'emptied' } & EmptiedRule)
	| { kind: 'above'; below: PrunedElement }

/** A container the commit removes, why, and what it still holds (`within`). */
export type PrunedContainer = {
	element: PrunedElement
	parent: PrunedElement
	reason: PruneReason
	within: readonly Scl.RawRecord<Scl.ElementsOf>[]
	/** Outside it: the control blocks sending the data set it was, `cleared` of it and `revised`. */
	goesWith: readonly PrunedEffect[]
}

/**
 * What a container's removal does to an element outside it: a reference naming it or what it held, deleted or cleared,
 * and a control block of a pruned data set, cleared of it and revised.
 */
export type PrunedEffect = {
	element: PrunedElement
	/** What names the element for a person, where its tag has it. */
	identity: NamedIdentity
	effect: 'deleted' | 'cleared' | 'revised'
	/** Every record it takes with it, its own subtree: each goes with it and is not listed on its own. */
	holds: readonly Scl.RawRecord<Scl.ElementsOf>[]
}

/** What the commit's prune stages, and each container it removes. */
export type PrunedEmptiedContainers = {
	operations: Scl.Operation[]
	containers: PrunedContainer[]
}
