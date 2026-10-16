import { createDataflowContext } from './dataflow-context'
import { describeSignal } from './describe-signal'

import type { SpecifiedDataflow } from '../dataflow.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: the dataflow a ControlRef describes, an output of its LNode: which logical node
 * it controls data of, where the two are implemented, and the ExtCtrl implementing it.
 */
export async function ofControlRef(
	query: Core.Query<Config>,
	params: { ref: Scl.Ref<'ControlRef'> },
): Promise<SpecifiedDataflow> {
	return describeSignal({ ref: params.ref, context: createDataflowContext(query) })
}
