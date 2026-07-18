import type { ConstraintViolation } from './find-constraint-violation.types'

/** The outcome of resolving a placement collision. */
export type PlacementResolution =
	/** No constraint was violated. */
	| { status: 'ok' }
	/** A violation auto-resolved by bumping an editable field to a free value. */
	| { status: 'resolved'; attr: string; from: string; to: string }
	/** A violation whose key is entirely identity — not auto-resolvable here. */
	| { status: 'unresolvable'; violation: ConstraintViolation }
