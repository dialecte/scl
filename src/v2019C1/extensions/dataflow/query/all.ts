import { createDataflowContext } from './dataflow-context'
import { describeDocument } from './describe-document'

import type { Dataflow } from '../dataflow.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: every dataflow of the document: each signal of the specification with what
 * implements it, in document order, then the implementation-only entries (an ExtRef naming a
 * control block that no signal links to), in document order.
 */
export async function all(query: Core.Query<Config>): Promise<Dataflow[]> {
	return describeDocument({ context: createDataflowContext(query) })
}
