import type * as Core from '@dialecte/core'

/** A detected violation: the constraint broken and the existing child it collides with. */
export type ConstraintViolation = {
	/** The violated constraint's name (e.g. `uniqueChildNameInBay`). */
	constraint: string
	/** The key fields the constraint compares (e.g. `['name']`). */
	fields: string[]
	/** The id of the existing sibling the candidate collides with. */
	offendingId: string
}

/** The uniqueness constraints a child is compared under, and the siblings it is compared with. */
export type ConstraintScope = {
	constraints: readonly Core.IdentityConstraint[]
	children: readonly Core.AnyTreeRecord[]
}
