import { assertNoIdentityCollision } from './find-identity-collision'
import { resolvePlacementCollision } from './resolve-placement-collision'

import type { PlacementCollisionParams } from './resolve-placement-collision.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Make an element an operation places unique where it sits, or refuse it: a key it shares with a sibling is told apart
 * by numbering its editable field (as `resolvePlacementCollision` does); a key none of whose fields can be changed is
 * refused with `IDENTITY_COLLISION`, nothing numbered.
 */
export async function placeUniquely(
	tx: Core.Transaction<Config>,
	params: PlacementCollisionParams,
): Promise<void> {
	const outcome = await resolvePlacementCollision(tx, params)
	if (outcome.status !== 'unresolvable') return
	await assertNoIdentityCollision(tx, { ref: params.ref, parentRef: params.parentRef })
}
