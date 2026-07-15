import { classifyAttribute } from './classify-attribute'
import { findConstraintViolation } from './find-constraint-violation'
import { resolveUniqueValue } from './resolve-unique-value'

import type { ConstraintViolation } from './find-constraint-violation.types'
import type { CollisionDecorator } from './resolve-unique-value.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The outcome of resolving a placement collision. */
export type PlacementResolution =
	/** No constraint was violated. */
	| { status: 'ok' }
	/** A violation auto-resolved by bumping an editable field to a free value. */
	| { status: 'resolved'; attr: string; from: string; to: string }
	/** A violation whose key is entirely identity — not auto-resolvable here. */
	| { status: 'unresolvable'; violation: ConstraintViolation }

/**
 * Validate a just-placed element against its parent context and resolve a scoped-
 * uniqueness collision GENERICALLY over whichever key field is EDITABLE:
 *
 *  1. detect a violation from the parent (`findConstraintViolation`);
 *  2. if the violated key includes an editable field (`rename`/`free` per
 *     `classifyAttribute`), bump it to the first free value (`resolveUniqueValue`)
 *     and apply it — the after-updated hook then rebuilds any ref paths that
 *     traverse it;
 *  3. if the violated key is entirely IDENTITY (e.g. an LNode lnClass/lnInst tuple),
 *     it is NOT auto-resolvable (that would be a delete+create) — reported as
 *     `unresolvable` for the future validation/conflict surface.
 *
 * This is the auto-resolution (default fallback) half; a full-track consumer can
 * instead supply `overrides` (user-edited values for editable attributes). Those are
 * applied first, then uniqueness is re-ensured on the key field — so a user-typed name
 * that itself collides is still bumped to a free value.
 */
export async function resolvePlacementCollision(
	tx: Core.Transaction<Config>,
	params: {
		ref: Scl.Ref<Scl.ElementsOf>
		parentRef?: Scl.Ref<Scl.ElementsOf>
		decorate?: CollisionDecorator
		overrides?: Record<string, string>
	},
): Promise<PlacementResolution> {
	const { ref, decorate, overrides } = params

	const parentRef =
		params.parentRef ?? ((await tx.getRecord(ref))?.parent as Scl.Ref<Scl.ElementsOf> | undefined)
	if (!parentRef) return { status: 'ok' }

	let candidate: Record<string, string | undefined> = await tx.getAttributes(ref)

	// apply the user's edited values for editable attributes first
	if (overrides) {
		for (const [attr, value] of Object.entries(overrides)) {
			const mode = classifyAttribute(ref.tagName, attr)
			if ((mode === 'rename' || mode === 'free') && candidate[attr] !== value) {
				await tx.update(ref, { attributes: { [attr]: value } })
				candidate = { ...candidate, [attr]: value }
			}
		}
	}

	const violation = await findConstraintViolation(tx, {
		parentRef,
		childTag: ref.tagName,
		candidate,
		excludeId: ref.id,
	})
	if (!violation) return { status: 'ok' }

	const editableField = violation.fields.find((field) => {
		const mode = classifyAttribute(ref.tagName, field)
		return mode === 'rename' || mode === 'free'
	})
	if (!editableField) return { status: 'unresolvable', violation }

	const from = candidate[editableField] ?? ''
	const to = await resolveUniqueValue(tx, {
		parentRef,
		childTag: ref.tagName,
		candidate,
		attr: editableField,
		excludeId: ref.id,
		decorate,
	})
	if (to !== from) await tx.update(ref, { attributes: { [editableField]: to } })
	return { status: 'resolved', attr: editableField, from, to }
}
