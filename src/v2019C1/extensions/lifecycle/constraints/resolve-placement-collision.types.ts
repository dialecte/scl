import type { ConstraintViolation } from './find-constraint-violation.types'
import type { Scl } from '@/v2019C1/config'

/** What a placement collision is resolved for. */
export type PlacementCollisionParams = {
	/** The element written. */
	ref: Scl.Ref<Scl.ElementsOf>
	/** The element whose rules cover it, when the caller knows it: else its parent, looked through a wrapper. */
	parentRef?: Scl.Ref<Scl.ElementsOf>
	/** The user's values for its editable attributes, written first. */
	overrides?: Record<string, string>
}

/** The outcome of resolving a placement collision. */
export type PlacementResolution =
	/** No constraint was violated. */
	| { status: 'ok' }
	/** A violation auto-resolved by bumping an editable field to a free value. */
	| { status: 'resolved'; attr: string; from: string; to: string }
	/** A violation whose key is entirely identity — not auto-resolvable here. */
	| { status: 'unresolvable'; violation: ConstraintViolation }
