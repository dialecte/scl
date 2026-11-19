import { createDataflowContext } from './dataflow-context'
import { supervisionOf } from './supervisions'

import type { Supervision } from '../dataflow.types'
import type { SupervisionsOfParams } from './supervisions-of.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query and transaction extension: the supervision of each control block in each subscriber IED
 * asked, in the order asked: the LGOS (GOOSE) or LSVS (sampled values) logical node of the subscriber
 * whose `setSrcRef` names the control block, as a dataflow's `implementation.supervision` gives it.
 * `undefined` for a control block or IED naming nothing, or no supervision. Read once per call,
 * whatever the number of requests; on a transaction, from its staged state.
 *
 * @intent which LGOS/LSVS supervises a GOOSE or sampled value control block, supervision of a control block in a subscriber IED, setSrcRef naming a control block
 */
export async function supervisionsOf(
	query: Core.Query<Config>,
	params: SupervisionsOfParams,
): Promise<(Supervision | undefined)[]> {
	const { requests } = params
	if (requests.length === 0) return []
	const context = createDataflowContext(query)
	const { controlBlocks, iedByName } = await context.iedSection()
	const iedIds = new Set([...iedByName.values()].map(({ id }) => id))
	const index = await context.supervisionIndex()
	return requests.map(({ controlBlock: ref, subscriber }) => {
		const controlBlock = controlBlocks.get(ref.id)
		if (!controlBlock || controlBlock.record.tagName !== ref.tagName) return undefined
		if (!iedIds.has(subscriber.id)) return undefined
		return supervisionOf({ index, controlBlock, subscriber })
	})
}
