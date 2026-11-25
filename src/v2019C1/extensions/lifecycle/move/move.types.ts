import type { MOVE_ANCHOR_REFUSAL_KEYS } from './move.constants'
import type { Scl } from '@/v2019C1/config'
import type { KeyTaken } from '@/v2019C1/extensions/lifecycle/constraints/judge-key-taken.types'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type {
	CommitRefusal,
	CommitRefusalElement,
} from '@/v2019C1/hooks/before-commit/commit-plan.types'

/** Where a move puts an element: its new parent, and the sibling of its tag it goes before (last when absent). */
export type ReportMoveParams = {
	ref: Scl.Ref<Scl.ElementsOf>
	parent: Scl.Ref<Scl.ElementsOf>
	before?: Scl.Ref<Scl.ElementsOf>
}

/**
 * A move to write, with the values the review gives the element's editable attributes (`name`, `desc`, ...): a name
 * given is kept unless taken where the element lands, then numbered; absent, the name the report proposes is written.
 * Attributes that are not editable are ignored.
 */
export type ApplyMoveParams = ReportMoveParams & { rename?: Record<string, string> }

/** The element a move puts elsewhere, where from and where to, and what follows it. */
export type MovedElement = {
	element: CommitRefusalElement
	from: CommitRefusalElement
	to: CommitRefusalElement
	/**
	 * The records the move carries, the element itself included, its transparent wrappers (a `Private`) left out: what
	 * it holds for a person, the naming of each LNode among them.
	 */
	subtreeSize: number
	/** The references the commit rewrites to follow the move (their path or names), those it clears left out. */
	followingReferences: number
	/** Present when the element only changes place among the children of its parent. */
	reordered?: true
	/** Present when a sibling at the new parent holds its key (its name), with the values the engine proposes instead. */
	keyTaken?: KeyTaken
}

/** A key core refuses a move's anchors with. */
export type MoveAnchorRefusalKey = (typeof MOVE_ANCHOR_REFUSAL_KEYS)[number]

/**
 * Why a move is refused, as the error it is thrown with: a refusal of the commit (`CommitRefusal`), core's refusal of
 * the anchors, the element or its new parent the document does not hold (`ELEMENT_NOT_FOUND`), or an all-identity key
 * the element shares at its new parent (`IDENTITY_COLLISION`).
 */
export type MoveRefusal =
	| CommitRefusal
	| {
			key: MoveAnchorRefusalKey | 'ELEMENT_NOT_FOUND' | 'IDENTITY_COLLISION'
			code: string
			meta?: Record<string, unknown>
			detail: string
	  }

/**
 * A move, reported for a merge review: a `DiffReport` holding one `moved` node and its group, with the element moved,
 * every refusal up front, and `nothingToMove` when the element is already where it is asked to go.
 */
export type MoveReport = Omit<DiffReport, 'refusals'> & {
	move?: MovedElement
	refusals: MoveRefusal[]
	nothingToMove?: true
}
