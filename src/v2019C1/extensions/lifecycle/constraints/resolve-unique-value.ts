import { findConstraintViolation } from './find-constraint-violation'

import { throwDialecteError } from '@dialecte/core'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const MAX_ATTEMPTS = 1000

/**
 * Resolve a collision-free value for the editable attribute `attr` of an element
 * being placed under `parentRef`, generic over `attr` (not hardcoded to `name`).
 *
 *  - candidate unique as-is -> returns its current `attr` value unchanged;
 *  - otherwise numbers it: `<value>_1`, `<value>_2`, … — and a value that already ends with
 *    a number gets the next free number instead of a second one (`Prot_1` taken -> `Prot_2`,
 *    never `Prot_1_1`). The first value free where the element sits is the one returned.
 *
 * One format, owned by the engine. `excludeId` skips the element itself when re-checking an
 * in-place value.
 */
export async function resolveUniqueValue(
	query: Core.Query<Config>,
	params: {
		parentRef: Scl.Ref<Scl.ElementsOf>
		childTag: string
		candidate: Record<string, string | undefined>
		attr: string
		excludeId?: string
		/**
		 * Values already given to elements that do not exist yet (a report describing several
		 * elements to create): taken too, as they will be once those elements are created.
		 */
		claimed?: ReadonlySet<string>
	},
): Promise<string> {
	const { parentRef, childTag, candidate, attr, excludeId, claimed } = params
	const base = candidate[attr] ?? ''

	const asIs = await findConstraintViolation(query, { parentRef, childTag, candidate, excludeId })
	if (!asIs && !claimed?.has(base)) return base

	const { stem, next } = splitNumber(base)
	for (let attempt = next; attempt < next + MAX_ATTEMPTS; attempt++) {
		const value = `${stem}_${attempt}`
		if (claimed?.has(value)) continue
		const trial = { ...candidate, [attr]: value }
		const violation = await findConstraintViolation(query, {
			parentRef,
			childTag,
			candidate: trial,
			excludeId,
		})
		if (!violation) return value
	}

	throwDialecteError('UNIQUE_CONSTRAINT_VIOLATION', {
		detail: `could not resolve a unique ${attr} for <${childTag}> under <${parentRef.tagName}> after ${MAX_ATTEMPTS} attempts`,
		ref: parentRef,
		meta: { attr, childTag, value: base },
	})
}

/**
 * A value read in the engine's own numbering: the part before a trailing `_<n>` and the number
 * to try first — the next one, or 1 when the value carries none.
 */
function splitNumber(value: string): { stem: string; next: number } {
	const numbered = /^(.+)_(\d+)$/.exec(value)
	if (!numbered) return { stem: value, next: 1 }
	return { stem: numbered[1], next: Number(numbered[2]) + 1 }
}
