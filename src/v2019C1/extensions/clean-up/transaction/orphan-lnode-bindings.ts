import type { Scl } from '@/v2019C1/config'

/**
 * Resets LNode IED bindings when the referenced IED is absent from the target DB.
 *
 * Logic per LNode:
 * - iedName is 'None' or empty → skip (already unbound)
 * - IED with matching name found → skip (binding valid)
 * - IED absent + LNodeSpecNaming child exists → restore lnClass/lnInst/prefix
 *   from spec naming, clear iedName/ldInst/lnUuid, reset spec naming sIedName/sLdInst
 * - IED absent + no LNodeSpecNaming → clear all binding attrs
 */
export async function resetLNodes(tx: Scl.Transaction): Promise<void> {
	const lnodes = await tx.getRecordsByTagName('LNode')

	for (const lnode of lnodes) {
		const iedName = await tx.getAttribute(lnode, { name: 'iedName' })
		if (!iedName || iedName === 'None') continue

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
	tx: Scl.Transaction,
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
				templateUuid: undefined,
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
				templateUuid: undefined,
				lnClass: undefined,
				lnInst: undefined,
				prefix: undefined,
			},
		})
	}
}
