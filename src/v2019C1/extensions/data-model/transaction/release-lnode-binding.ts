import { unassignedNaming } from '@/v2019C1/extensions/data-model/naming/lnode-naming'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Assign an LNode to no IED: `iedName` `None`, `lnUuid` removed, its logical device, prefix, class
 * and instance those of its `LNodeSpecNaming`, which is left as it is (`ldInst` removed when it
 * names none). Only the LNode's own attributes change: what its data and signals name is left to
 * the caller.
 */
export async function releaseLNodeBinding(
	tx: Core.Transaction<Config>,
	params: { lnode: Scl.Ref<'LNode'> },
): Promise<void> {
	const { lnode } = params
	const lnodeAttributes = await tx.getAttributes(lnode)
	const naming = await tx.getChild(lnode, 'LNodeSpecNaming')
	const specifiedAttributes = naming ? await tx.getAttributes(naming) : undefined
	const reset = { ...unassignedNaming({ lnodeAttributes, specifiedAttributes }), lnUuid: undefined }
	await tx.update(lnode, { attributes: reset })
}
