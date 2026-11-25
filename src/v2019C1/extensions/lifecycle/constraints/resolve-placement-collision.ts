import { classifyAttribute } from './classify-attribute'
import { findViolationInScope, readConstraintScope } from './find-constraint-violation'
import { findUniqueValueInScope } from './resolve-unique-value'

import { toRef } from '@dialecte/core/helpers'

import {
	isOwnTransparentElement,
	isTransparentElement,
} from '@/v2019C1/helpers/transparent-elements'

import type {
	PlacementCollisionParams,
	PlacementResolution,
} from './resolve-placement-collision.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Validate a just-placed element against its parent context and resolve a scoped-
 * uniqueness collision GENERICALLY over whichever key field is EDITABLE:
 *
 *  1. detect a violation from the parent (`findViolationInScope`, on the scope read once);
 *  2. if the violated key includes an editable field (`rename`/`free` per
 *     `classifyAttribute`), bump it to the first free value (`findUniqueValueInScope`)
 *     and apply it — the after-updated hook then rebuilds any ref paths that
 *     traverse it;
 *  3. if the violated key is entirely IDENTITY (e.g. an LNode lnClass/lnInst tuple),
 *     it is NOT auto-resolvable (that would be a delete+create) — returned as
 *     `unresolvable`: an operation placing the element refuses it (`placeUniquely`).
 *
 * This is the auto-resolution (default fallback) half; a full-track consumer can
 * instead supply `overrides` (user-edited values for editable attributes). Those are
 * applied first, then uniqueness is re-ensured on the key field — so a user-typed name
 * that itself collides is still bumped to a free value.
 */
export async function resolvePlacementCollision(
	tx: Core.Transaction<Config>,
	params: PlacementCollisionParams,
): Promise<PlacementResolution> {
	const { ref, overrides } = params

	const parentRef = params.parentRef ?? (await findConstraintParent(tx, { ref }))
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

	// one read of the scope serves the check and the numbering
	const scope = await readConstraintScope(tx, { parentRef, childTag: ref.tagName })
	const violation = findViolationInScope({ scope, candidate, excludeId: ref.id })
	if (!violation) return { status: 'ok' }

	const editableField = violation.fields.find((field) => {
		const mode = classifyAttribute(ref.tagName, field)
		return mode === 'rename' || mode === 'free'
	})
	if (!editableField) return { status: 'unresolvable', violation }

	const from = candidate[editableField] ?? ''
	const to = findUniqueValueInScope({
		scope,
		parentRef,
		childTag: ref.tagName,
		candidate,
		attr: editableField,
		excludeId: ref.id,
	})
	if (to !== from) await tx.update(ref, { attributes: { [editableField]: to } })
	return { status: 'resolved', attr: editableField, from, to }
}

/**
 * The element whose uniqueness rules cover `ref`: its parent, past the dialecte's own wrappers (an SCL Private), as
 * core reads the chain; a same-name element of another namespace (a vendor's Private) is an ordinary parent.
 */
export async function findConstraintParent(
	query: Core.Query<Config>,
	params: { ref: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	// the parent links are followed one record at a time, as before: a wrapper is read only to tell its namespace
	let parent = (await query.getRecord(params.ref))?.parent
	while (parent && isTransparentElement(parent.tagName)) {
		// dialecte-allow query-in-loop: each wrapper's parent is known only once it is read; as many reads as main's walk
		const wrapper = await query.getRecord(parent as Scl.Ref<Scl.ElementsOf>)
		if (!wrapper || !isOwnTransparentElement({ record: wrapper })) break
		parent = wrapper.parent
	}
	return parent ? (toRef(parent) as Scl.Ref<Scl.ElementsOf>) : undefined
}
