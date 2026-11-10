import { findMappedLn } from './find-mapped-ln'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Resolves a mapped `LNode` to the IED `LN` (or `LN0`) that implements it, by the same rule as
 * {@link resolveMappedLNodes}: a truthy `lnUuid` decides alone, even when it names nothing and
 * whatever the names say; otherwise the complete name path, so an LNode with `iedName="None"` and
 * no `lnUuid` resolves to nothing. Vendor look-alikes in a `Private` are never the answer. One call
 * does not read the document; for several LNodes, call `resolveMappedLNodes` once.
 *
 * @intent LN that implements an LNode, go from a function LNode to its IED LN/LN0, follow an LNode binding into the IED section
 *
 * @example
 * const ln = await resolveMappedLNode(query, lnodeRecord)
 * // → TrackedRecord<'LN' | 'LN0'> for the implementing LN, or undefined
 */
export async function resolveMappedLNode(
	query: Core.Query<Config> | Core.Transaction<Config>,
	lnode: Scl.TrackedRecord<'LNode'>,
): Promise<Scl.TrackedRecord<'LN' | 'LN0'> | undefined> {
	const found = await findMappedLn(query, { lnode })
	return found?.ln
}
