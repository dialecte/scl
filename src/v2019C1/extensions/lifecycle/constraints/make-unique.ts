import { resolvePlacementCollision } from './resolve-placement-collision'

import type { MakeUniqueParams } from './make-unique.types'
import type { PlacementResolution } from './resolve-placement-collision.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * `tx.lifecycle.makeUnique` — make an element unique where it sits, by the schema's uniqueness
 * rules: when a key it shares with a sibling has an editable field, that field is numbered in
 * the engine's one format (`<value>_1`, or the next number when the value already ends with one)
 * and written. Says what it did as data: `ok` (already unique), `resolved` (`attr`, `from`, `to`),
 * or `unresolvable` (the key has no field that can be changed).
 *
 * The tool a consumer calls after giving an element the name it wants, so that the engine alone
 * decides how a taken name is told apart.
 */
export async function makeUnique(
	tx: Core.Transaction<Config>,
	params: MakeUniqueParams,
): Promise<PlacementResolution> {
	return resolvePlacementCollision(tx, { ref: params.ref })
}
