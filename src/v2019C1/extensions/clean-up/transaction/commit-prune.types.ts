import type { Scl } from '@/v2019C1/config'
import type {
	PrunedEffect,
	PruneReason,
} from '@/v2019C1/hooks/before-commit/prune-emptied-containers.types'

/** An element by its tag and record id. */
export type CommitPrunedElement = { tagName: Scl.ElementsOf; id: string }

/** What names an element for a person, where its tag has it. */
export type CommitPrunedIdentity = { name?: string; uuid?: string; type?: string }

/** A container the commit removes, with what it holds and what goes with it. */
export type CommitPrunedContainer = {
	element: CommitPrunedElement
	identity: CommitPrunedIdentity
	parent: CommitPrunedElement & { name?: string }
	/**
	 * The nearest element at or above it a reference path names, with that path (`S1/V1/B1` for a bay's Labels); absent
	 * when no element of its line is named in a path (a SubNetwork).
	 */
	owner?: CommitPrunedElement & { path: string }
	reason: PruneReason
	/**
	 * Every record it takes with it, its subtree in document order, another tool's data included; a container listed
	 * below it keeps its own records.
	 */
	holds: readonly Scl.RawRecord<Scl.ElementsOf>[]
	/** Outside it: the control blocks sending the data set it was, `cleared` of it and `revised` by the commit. */
	goesWith: readonly PrunedEffect[]
}

/** A type the commit removes as unused, with the records it holds. */
export type CommitPrunedType = {
	element: CommitPrunedElement
	identity: { id?: string }
	holds: readonly Scl.RawRecord<Scl.ElementsOf>[]
}

/**
 * What the commit will prune, read from the transaction's staged operations without writing: valid only for the staged
 * state it read (`stagedCount` operations).
 */
export type CommitPrune = {
	stagedCount: number
	containers: CommitPrunedContainer[]
	types: CommitPrunedType[]
}
