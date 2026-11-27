import type { Scl } from '@/v2019C1/config'
import type { CommitRefusal } from '@/v2019C1/hooks/before-commit/commit-plan.types'
import type { MoveRemoval } from '@/v2019C1/hooks/before-commit/moves.types'
import type {
	PrunedEffect,
	PruneReason,
} from '@/v2019C1/hooks/before-commit/prune-emptied-containers.types'
import type { ReleasedLNodeBinding } from '@/v2019C1/hooks/before-commit/release-deleted-logical-nodes.types'
import type { NamedIdentity } from '@/v2019C1/hooks/shared/element-identity.types'
import type { NormalisedReferenceGroups } from '@/v2019C1/hooks/shared/stray-lnode-uuid.types'

/** An element by its tag and record id. */
export type CommitPrunedElement = { tagName: Scl.ElementsOf; id: string }

/** What names an element for a person, where its tag has it. */
export type CommitPrunedIdentity = NamedIdentity

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
	/** Each element the commit's moves remove, with why it goes. */
	moves: MoveRemoval[]
	/** Each LNode the commit releases from a logical node the transaction deleted. */
	released: ReleasedLNodeBinding[]
	/**
	 * Every move the commit does not follow and every incoherent uuid reference it refuses, in the order it judges them:
	 * listed with `{ collect: true }` (the commit then refuses with the first), empty otherwise.
	 */
	refusals: CommitRefusal[]
	/** Each behaviour variable the commit writes without the `lnodeUuid` that only repeated the LNode of its input or output. */
	normalised: NormalisedReferenceGroups[]
}

/** How the preview reads a transaction the commit refuses. */
export type CommitPruneOptions = {
	/**
	 * List the moves the commit does not follow and the incoherent uuid references in `refusals` instead of throwing the
	 * first; every other refusal still throws.
	 */
	collect?: boolean
}
