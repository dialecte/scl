import { throwDialecteError } from '@dialecte/core'

import { assertNoIdentityCollision } from '@/v2019C1/extensions/lifecycle/constraints/find-identity-collision'
import { isEditable } from '@/v2019C1/extensions/lifecycle/constraints/judge-key-taken'
import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints/resolve-placement-collision'

import type { ApplyMoveParams } from './move.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Write a move as `reportMove` reported it: the move, then the refusal of an all-identity key the element shares at its
 * new parent (`IDENTITY_COLLISION`), then the editable attributes `rename` gives (the others ignored) with the name
 * numbered when taken there; without a name given, the name the report proposed is written. The commit follows the
 * move and refuses what `reportMove` listed (a move it does not follow).
 *
 * @intent write a cut and paste after its review, move an element to another parent with a new name
 */
export async function applyMove(
	tx: Core.Transaction<Config>,
	params: ApplyMoveParams,
): Promise<Scl.RawRecord<Scl.ElementsOf>> {
	const { ref, parent, before, rename } = params
	await tx.any.move(ref, { parent, ...(before ? { before } : {}) })
	await assertNoIdentityCollision(tx, { ref })
	await resolvePlacementCollision(tx, { ref, overrides: editableOf({ ref, rename }) })
	const moved = await tx.getRecord(ref)
	if (!moved) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail: `applyMove: the moved ${ref.tagName} "${ref.id}" is not in the document`,
		})
	}
	return moved
}

/** The values `rename` gives the element's editable attributes, the others left out. */
function editableOf(params: {
	ref: Scl.Ref<Scl.ElementsOf>
	rename: Record<string, string> | undefined
}): Record<string, string> {
	const { ref, rename } = params
	return Object.fromEntries(
		Object.entries(rename ?? {}).filter(([attribute]) =>
			isEditable({ tagName: ref.tagName, attribute }),
		),
	)
}
