import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/** The unbound `iedName` marker — an LNode not implemented in any IED. */
const UNBOUND_IED_NAME = 'None'

/**
 * Whether an `LNode` is **locked** — i.e. bound to an IED (implemented). An LNode
 * is locked when its `iedName` is set and is not the unbound `'None'` marker.
 *
 * A locked LNode's identity + `lnType` are owned by the implementation: the
 * lifecycle merge/update must never overwrite them, even on a UI-instructed edit.
 *
 * The binding IS the lock; whether the referenced IED currently exists in the
 * document is a separate *validity* question owned by orphan cleanup
 * (`resetLNodes`), not by this predicate — so a dangling (orphaned) binding is
 * still locked and stays protected until cleanup resolves it. The S-IED
 * specification convention (`manufacturer="S_IED"`) is likewise not considered.
 */
export async function isLNodeLocked(
	query: Core.Query<Config>,
	ref: AnyRefOrRecord,
): Promise<boolean> {
	const iedName = await query.any.getAttribute(ref, { name: 'iedName' })
	return Boolean(iedName) && iedName !== UNBOUND_IED_NAME
}
