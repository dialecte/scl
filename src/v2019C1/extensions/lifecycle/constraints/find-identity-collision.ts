import { classifyAttribute, isEditableMode } from './classify-attribute'
import { findViolationInScope, readConstraintScope } from './find-constraint-violation'
import { findConstraintParent } from './resolve-placement-collision'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type {
	FindIdentityCollisionParams,
	IdentityCollision,
	IdentityCollisionInScopeParams,
} from './find-identity-collision.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * The collision of a candidate with an element of `scope` on a key none of whose fields can be changed, or
 * `undefined`: none, or one a field the engine numbers tells apart. Pure, on a scope read once.
 */
export function identityCollisionInScope(
	params: IdentityCollisionInScopeParams,
): IdentityCollision | undefined {
	const { scope, tagName, candidate, excludeId } = params
	const violation = findViolationInScope({ scope, candidate, excludeId })
	if (!violation) return undefined
	if (violation.fields.some((field) => isEditableMode(classifyAttribute(tagName, field)))) {
		return undefined
	}
	const offending = scope.children.find((child) => child.id === violation.offendingId)
	if (!offending) return undefined
	return {
		constraint: violation.constraint,
		fields: violation.fields,
		collidesWith: { tagName: offending.tagName, id: offending.id },
	}
}

/** The collision of an element as it now sits, on a key none of whose fields can be changed, or `undefined`. */
export async function findIdentityCollision(
	query: Core.Query<Config>,
	params: FindIdentityCollisionParams,
): Promise<IdentityCollision | undefined> {
	const { ref } = params
	const parentRef = params.parentRef ?? (await findConstraintParent(query, { ref }))
	if (!parentRef) return undefined
	const candidate = await query.getAttributes(ref)
	const scope = await readConstraintScope(query, { parentRef, childTag: ref.tagName })
	return identityCollisionInScope({ scope, tagName: ref.tagName, candidate, excludeId: ref.id })
}

/** Refuse an element that collides where it sits on a key none of whose fields can be changed. */
export async function assertNoIdentityCollision(
	query: Core.Query<Config>,
	params: FindIdentityCollisionParams,
): Promise<void> {
	const collision = await findIdentityCollision(query, params)
	if (collision) refuseIdentityCollision({ element: params.ref, collision })
}

/** Throw the refusal of an element colliding on a key none of whose fields can be changed. */
export function refuseIdentityCollision(params: {
	element: AnyRefOrRecord
	collision: IdentityCollision
}): never {
	const { element, collision } = params
	const { constraint, fields, collidesWith } = collision
	return throwDialecteError(SCL_ERRORS.IDENTITY_COLLISION, {
		meta: {
			constraint,
			fields,
			element: { tagName: element.tagName, id: element.id },
			collidesWith: { tagName: collidesWith.tagName, id: collidesWith.id },
		},
		detail: `<${element.tagName}> "${element.id}" shares with <${collidesWith.tagName}> "${collidesWith.id}" every field of ${constraint} (${fields.join(', ')}): none can be changed`,
	})
}
