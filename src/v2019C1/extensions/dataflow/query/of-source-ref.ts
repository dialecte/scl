import { createDataflowContext } from './dataflow-context'
import { describeSignal } from './describe-signal'

import type { SpecifiedDataflow } from '../dataflow.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: the dataflow a SourceRef describes, an input of its LNode: what it takes from
 * which logical node, where the two are implemented, and the ExtRef, control block and registration
 * implementing it.
 */
export async function ofSourceRef(
	query: Core.Query<Config>,
	params: { ref: Scl.Ref<'SourceRef'> },
): Promise<SpecifiedDataflow> {
	return describeSignal(query, {
		ref: params.ref,
		direction: 'input',
		context: createDataflowContext(query),
	})
}
