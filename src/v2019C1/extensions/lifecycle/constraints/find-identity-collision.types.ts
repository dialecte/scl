import type { ConstraintScope } from './find-constraint-violation.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Two elements in one place sharing every field of a key none of which can be changed (the key of a logical node:
 * its class, instance, prefix, device and IED): nothing numbered tells them apart.
 */
export type IdentityCollision = {
	/** The uniqueness constraint broken (e.g. `uniqueLNodeInFunctionB`). */
	constraint: string
	/** The key fields it compares. */
	fields: string[]
	/** The element of the project the other one collides with. */
	collidesWith: { tagName: string; id: string }
}

export type IdentityCollisionInScopeParams = {
	scope: ConstraintScope
	/** The tag of the element compared. */
	tagName: string
	/** Its attribute values. */
	candidate: Record<string, string | undefined>
	/** The element itself, when it already sits there. */
	excludeId?: string
}

export type FindIdentityCollisionParams = {
	/** The element written. */
	ref: Scl.Ref<Scl.ElementsOf>
	/** The element whose rules cover it, when the caller knows it: else its parent, looked through a wrapper. */
	parentRef?: Scl.Ref<Scl.ElementsOf>
}
