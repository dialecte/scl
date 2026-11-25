import type { IdentityCollision } from './find-identity-collision.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * A key of an element (a schema `key` or `unique` constraint it falls under where it sits) that a sibling holds already,
 * with what the engine numbers instead: the constraint, the values of its fields the element holds, the sibling holding
 * them, and the values of its editable fields the engine proposes (those the apply writes unless the review types
 * others).
 */
export type KeyTaken = {
	constraint: string
	values: Readonly<Record<string, string>>
	/**
	 * The sibling holding the key: an element of the document, or — for a copy, whose roots are judged in turn — a root
	 * the copy places before this one, named by its source element (the first added group's `primary.sourceRef`: "the
	 * copy of F1").
	 */
	takenBy: { tagName: string; id: string }
	proposed: Readonly<Record<string, string>>
}

export type JudgeKeyTakenParams = {
	/** Where the uniqueness of the element is judged: its parent, a transparent wrapper (a `Private`) passed through. */
	parentRef: Scl.Ref<Scl.ElementsOf>
	tagName: Scl.ElementsOf
	/** The attributes the element holds, or will hold where it lands. */
	candidate: Readonly<Record<string, string | undefined>>
	/** The element itself when it sits there already (a move): not compared with itself. */
	excludeId?: string
	/**
	 * What the same operation places there before the element, as it lands (a copy of an application: the functions
	 * placed before it): compared with as siblings, numbered after.
	 */
	placedBefore?: readonly AnyTreeRecord[]
}

/** What a placement shares with its siblings: a key it can be told apart on, or one it cannot (a refusal). */
export type JudgedKey = { keyTaken?: KeyTaken; identityCollision?: IdentityCollision }
