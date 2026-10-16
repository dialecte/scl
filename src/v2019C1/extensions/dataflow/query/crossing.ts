import { createDataflowContext } from './dataflow-context'
import { dataflowSides } from './dataflow-sides'
import { describeDocument } from './describe-document'

import type { Dataflow } from '../dataflow.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: the dataflows with exactly one side inside a set of IEDs, in the order of `all`.
 * A dataflow's sides are the IED holding what implements it and the IED it takes its data from or
 * controls; a side the set does not hold - an IED the document lacks included - is outside. A
 * dataflow between two IEDs of the set, or between two IEDs outside it, does not cross it.
 */
export async function crossing(
	query: Core.Query<Config>,
	params: { ieds: readonly Scl.Ref<'IED'>[] },
): Promise<Dataflow[]> {
	const inside = new Set(params.ieds.map(({ id }) => id))
	const context = createDataflowContext(query)
	const dataflows = await describeDocument({ context })
	const iedSection = await context.iedSection()
	return dataflows.filter((dataflow) => {
		const { near, far } = dataflowSides({ dataflow, iedSection })
		return isInside({ side: near, inside }) !== isInside({ side: far, inside })
	})
}

function isInside(params: {
	side: Scl.Ref<'IED'> | undefined
	inside: ReadonlySet<string>
}): boolean {
	const { side, inside } = params
	return side !== undefined && inside.has(side.id)
}
