import { findConstraintViolation } from './find-constraint-violation'

import type { CollisionDecorator } from './resolve-unique-value.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const MAX_ATTEMPTS = 1000

/**
 * Resolve a collision-free value for the editable attribute `attr` of an element
 * being placed under `parentRef`, generic over `attr` (not hardcoded to `name`).
 *
 *  - candidate unique as-is -> returns its current `attr` value unchanged;
 *  - otherwise proposes `${base}_${attempt}` (or a consumer-decorated variant) and
 *    increments `attempt` until the whole candidate is collision-free.
 *
 * The engine owns uniqueness (the loop); the {@link CollisionDecorator} only shapes
 * the scheme. `excludeId` skips the element itself when re-checking an in-place value.
 */
export async function resolveUniqueValue(
	query: Core.Query<Config>,
	params: {
		parentRef: Scl.Ref<Scl.ElementsOf>
		childTag: string
		candidate: Record<string, string | undefined>
		attr: string
		decorate?: CollisionDecorator
		excludeId?: string
	},
): Promise<string> {
	const { parentRef, childTag, candidate, attr, decorate, excludeId } = params
	const base = candidate[attr] ?? ''

	const asIs = await findConstraintViolation(query, { parentRef, childTag, candidate, excludeId })
	if (!asIs) return base

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const value = decorate ? decorate({ base, attempt, attr, childTag }) : `${base}_${attempt}`
		const trial = { ...candidate, [attr]: value }
		const violation = await findConstraintViolation(query, {
			parentRef,
			childTag,
			candidate: trial,
			excludeId,
		})
		if (!violation) return value
	}

	throw new Error(
		`could not resolve a unique ${attr} for <${childTag}> under <${parentRef.tagName}> after ${MAX_ATTEMPTS} attempts`,
	)
}
