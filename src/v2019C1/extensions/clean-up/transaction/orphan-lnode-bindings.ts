import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Resets LNode IED bindings when the referenced IED is absent from the target DB.
 *
 * Logic per LNode:
 * - iedName is 'None', empty, or absent → normalize the unbound marker to an
 *   explicit iedName='None' (the store is faithful, so an omitted iedName is not
 *   auto-stamped on import; the cleanup makes the canonical marker explicit)
 * - IED with matching name found → skip (binding valid)
 * - IED absent + LNodeSpecNaming child exists → restore lnClass/lnInst/prefix
 *   from spec naming, clear iedName/ldInst/lnUuid, reset spec naming sIedName/sLdInst
 * - IED absent + no LNodeSpecNaming → clear all binding attrs
 *
 * `templateUuid` is preserved in every case: it records the template the LNode was
 * instantiated from (the key used to re-locate an implementing ICD), which is
 * independent of whether the implementing IED is currently present.
 */
export async function resetLNodes(tx: Core.Transaction<Config>): Promise<void> {
	const lnodes = await tx.getRecordsByTagName('LNode')

	for (const lnode of lnodes) {
		const iedName = await tx.getAttribute(lnode, { name: 'iedName' })
		if (!iedName || iedName === 'None') {
			// Already unbound — stamp the explicit 'None' marker (no-op if already stored).
			await tx.update(lnode, { attributes: { iedName: 'None' } })
			continue
		}

		const [ied] = await tx.findByAttributes({
			tagName: 'IED',
			attributes: { name: iedName },
		})
		if (ied) continue

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
