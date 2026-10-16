import { createDataflowContext } from './dataflow-context'
import { dataflowSides } from './dataflow-sides'
import { describeDocument } from './describe-document'

import type { IedDataflows } from '../dataflow.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: the dataflows an IED subscribes to (it holds what implements them: the near
 * side) and publishes (it holds the control block they name, else the signal or the controlled
 * data they name: the far side). A dataflow no element implements yet is seen through the IEDs its
 * two LNodes are mapped to (the holder's for the subscribed list, the other's for the published
 * one). A dataflow inside the IED is in both. In the order of `all`.
 */
export async function ofIed(
	query: Core.Query<Config>,
	params: { ref: Scl.Ref<'IED'> },
): Promise<IedDataflows> {
	const context = createDataflowContext(query)
	const dataflows = await describeDocument({ context })
	const iedSection = await context.iedSection()
	const sides = dataflows.map((dataflow) => ({
		dataflow,
		...dataflowSides({ dataflow, iedSection }),
	}))
	return {
		published: sides.filter(({ far }) => far?.id === params.ref.id).map(({ dataflow }) => dataflow),
		subscribed: sides
			.filter(({ near }) => near?.id === params.ref.id)
			.map(({ dataflow }) => dataflow),
	}
}
