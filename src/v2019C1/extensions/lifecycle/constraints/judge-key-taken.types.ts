import type { IdentityCollision } from './find-identity-collision.types'
import type { Scl } from '@/v2019C1/config'

/**
 * A key of an element (a schema `key` or `unique` constraint it falls under where it sits) that a sibling holds already,
 * with what the engine numbers instead: the constraint, the values of its fields the element holds, the sibling holding
 * them, and the values of its editable fields the engine proposes (those the apply writes unless the review types
 * others).
 */
export type KeyTaken = {
	constraint: string
	values: Readonly<Record<string, string>>
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
}

/** What a placement shares with its siblings: a key it can be told apart on, or one it cannot (a refusal). */
export type JudgedKey = { keyTaken?: KeyTaken; identityCollision?: IdentityCollision }
