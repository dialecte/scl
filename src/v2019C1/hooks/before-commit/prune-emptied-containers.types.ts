import type { Scl } from '@/v2019C1/config'
import type { EmptiedRule } from '@/v2019C1/helpers/pruned-when-empty.types'

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
}

/** What the commit's prune stages, and each container it removes. */
export type PrunedEmptiedContainers = {
	operations: Scl.Operation[]
	containers: PrunedContainer[]
}
