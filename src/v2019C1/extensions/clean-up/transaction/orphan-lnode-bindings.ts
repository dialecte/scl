import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import { unassignedNaming } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { isLNodeLocked } from '@/v2019C1/extensions/data-model/query'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Resets LNode IED bindings when the referenced IED is absent from the target DB.
 *
 * Shares the lock predicate with the lifecycle merge: `isLNodeLocked` = the LNode
 * is bound to an IED (`iedName` set, not `'None'`). Cleanup then OWNS the unlock —
 * it resolves whether a locked binding is still valid (IED present) or dangling:
 *
 * - not locked (iedName 'None'/empty/absent) → normalize the unbound marker to an
 *   explicit iedName='None' (the store is faithful, so an omitted iedName is not
 *   auto-stamped on import; the cleanup makes the canonical marker explicit)
 * - locked + referenced IED present → skip (binding valid)
 * - locked + IED absent + LNodeSpecNaming child exists → restore lnClass/lnInst/prefix
 *   from spec naming (falling back to the LNode's current lnClass when sLnClass is
 *   absent — lnClass is a required XSD attribute with no default, so it must never be
 *   cleared), clear iedName/ldInst/lnUuid, reset spec naming sIedName/sLdInst
 * - locked + IED absent + no LNodeSpecNaming → clear only the binding-specific attrs
 *   (iedName/ldInst/lnUuid). lnClass/lnInst/prefix are left untouched: there is no
 *   backup of their pre-mapping specified values to restore them to, and lnClass in
 *   particular is required by the XSD (no default), so it can't be cleared
 *
 * `templateUuid` is preserved in every case: it records the template the LNode was
 * instantiated from (the key used to re-locate an implementing ICD), which is
 * independent of whether the implementing IED is currently present.
 */
export async function resetLNodes(tx: Core.Transaction<Config>): Promise<void> {
	const lnodes = await tx.getRecordsByTagName('LNode')

	for (const lnode of lnodes) {
		if (!(await isLNodeLocked(tx, lnode))) {
			// not bound — stamp the explicit 'None' marker (no-op if already stored).
			await tx.update(lnode, { attributes: { iedName: UNALLOCATED_IED_NAME } })
			continue
		}

		const iedName = await tx.getAttribute(lnode, { name: 'iedName' })
		const [ied] = await tx.findByAttributes({
			tagName: 'IED',
			attributes: { name: iedName },
		})
		if (ied) continue // binding still valid

		await resetLNodeBinding(tx, lnode)
	}
}

// ── Local helpers ───────────────────────────────────────────────────────────

async function resetLNodeBinding(
	tx: Core.Transaction<Config>,
	lnode: Scl.TrackedRecord<'LNode'>,
): Promise<void> {
	const lNodeSpecNaming = await tx.getChild(lnode, 'LNodeSpecNaming')
	const lnodeAttributes = await tx.getAttributes(lnode)
	const specifiedAttributes = lNodeSpecNaming ? await tx.getAttributes(lNodeSpecNaming) : undefined

	if (lNodeSpecNaming) {
		await tx.update(lNodeSpecNaming, {
			attributes: { sIedName: UNALLOCATED_IED_NAME, sLdInst: undefined },
		})
	}
	// Without an LNodeSpecNaming there is nothing to restore prefix, class and instance from: they
	// are left as they are (the class is required).
	await tx.update(lnode, {
		attributes: {
			...unassignedNaming({ lnodeAttributes, specifiedAttributes }),
			lnUuid: undefined,
		},
	})
}
