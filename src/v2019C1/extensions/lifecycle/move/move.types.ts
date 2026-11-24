import type { MOVE_ANCHOR_REFUSAL_KEYS } from './move.constants'
import type { Scl } from '@/v2019C1/config'
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

/** A name the moved element shares with an element of its new parent, and the name the engine proposes instead. */
export type NameTaken = {
	/** The editable key field taken (`name`). */
	attribute: string
	value: string
	proposed: string
	/** The uniqueness constraint the name breaks there. */
	constraint: string
	collidesWith: CommitRefusalElement
}

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
	/** Present when a sibling at the new parent holds its name. */
	nameTaken?: NameTaken
}

/** A key core refuses a move's anchors with. */
export type MoveAnchorRefusalKey = (typeof MOVE_ANCHOR_REFUSAL_KEYS)[number]

/**
 * Why a move is refused, as the error it is thrown with: a refusal of the commit (`CommitRefusal`), core's refusal of
 * the anchors, or an all-identity key the element shares at its new parent (`IDENTITY_COLLISION`).
 */
export type MoveRefusal =
	| CommitRefusal
	| {
			key: MoveAnchorRefusalKey | 'IDENTITY_COLLISION'
			code: string
			meta?: Record<string, unknown>
			detail: string
	  }

/**
 * A move, reported for a merge review: a `DiffReport` holding one `moved` node and its group, with the element moved,
 * every refusal up front, and `nothingToMove` when the element is already where it is asked to go.
 */
export type MoveReport = DiffReport & {
	move?: MovedElement
	refusals: MoveRefusal[]
	nothingToMove?: true
}
