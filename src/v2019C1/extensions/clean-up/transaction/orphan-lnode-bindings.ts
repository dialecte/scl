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
 *   from spec naming, clear iedName/ldInst/lnUuid, reset spec naming sIedName/sLdInst
 * - locked + IED absent + no LNodeSpecNaming → clear all binding attrs
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
			await tx.update(lnode, { attributes: { iedName: 'None' } })
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

	if (lNodeSpecNaming) {
		const sLnClass = await tx.getAttribute(lNodeSpecNaming, { name: 'sLnClass' })
		const sLnInst = await tx.getAttribute(lNodeSpecNaming, { name: 'sLnInst' })
		const sPrefix = await tx.getAttribute(lNodeSpecNaming, { name: 'sPrefix' })

		await tx.update(lNodeSpecNaming, {
			attributes: { sIedName: 'None', sLdInst: undefined },
		})

		await tx.update(lnode, {
			attributes: {
				iedName: 'None',
				ldInst: undefined,
				lnUuid: undefined,
				lnClass: sLnClass || undefined,
				lnInst: sLnInst || undefined,
				prefix: sPrefix || undefined,
			},
		})
	} else {
		await tx.update(lnode, {
			attributes: {
				iedName: 'None',
				ldInst: undefined,
				lnUuid: undefined,
				lnClass: undefined,
				lnInst: undefined,
				prefix: undefined,
			},
		})
	}
}
