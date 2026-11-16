import { planLNodeReleases } from '@/v2019C1/extensions/data-model/query/plan-lnode-releases'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Release an LNode's binding: back to the specification its `LNodeSpecNaming` keeps (see {@link releaseLNodeBindings}).
 */
export async function releaseLNodeBinding(
	tx: Core.Transaction<Config>,
	params: { lnode: Scl.Ref<'LNode'> },
): Promise<void> {
	await releaseLNodeBindings(tx, { lnodes: [params.lnode] })
}

/**
 * Release the bindings of the LNodes given: each goes back to the specification its `LNodeSpecNaming` keeps.
 * Specified on a specification IED that holds the logical node it specifies, no other LNode bound to that logical
 * node, and not released from that IED itself: bound to that logical node, named by its specified naming. Otherwise
 * assigned to no IED: `iedName` `None`, `lnUuid` removed, its logical device, prefix, class and instance those of its
 * `LNodeSpecNaming` (`ldInst` removed when it names none). The `LNodeSpecNaming` is left as it is. Only the LNodes'
 * own attributes change: what their data and signals name is left to the caller. The LNodes, their namings and the
 * specification IEDs are read once, whatever the number of LNodes ({@link planLNodeReleases}, which a commit hook
 * shares).
 */
export async function releaseLNodeBindings(
	tx: Core.Transaction<Config>,
	params: { lnodes: readonly Scl.Ref<'LNode'>[] },
): Promise<void> {
	const records = (await tx.getRecords([...params.lnodes])).filter((record) => record !== undefined)
	const plan = await planLNodeReleases(tx, { lnodes: records })
	for (const [id, attributes] of plan) {
		await tx.update({ tagName: 'LNode', id }, { attributes })
	}
}
