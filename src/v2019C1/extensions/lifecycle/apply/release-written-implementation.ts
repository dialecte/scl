import { collectWrittenImplementation } from './collect-written-implementation'

import { cleanUp } from '@/v2019C1/extensions/clean-up'

import type { ReleaseWrittenImplementationParams } from './release-written-implementation.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Once a lifecycle run has written everything: what it wrote naming a logical node, ExtRef or ExtCtrl the project lacks
 * is released (`resetLNodes` on the elements {@link collectWrittenImplementation} lists from the `from`-th staged
 * operation on). What the run did not write is left as it is, an LNode the project already held bound to a missing
 * logical node included.
 */
export async function releaseWrittenImplementation(
	tx: Core.Transaction<Config>,
	params: ReleaseWrittenImplementationParams,
): Promise<void> {
	const elements = collectWrittenImplementation(tx, { from: params.from })
	if (elements.length > 0) await cleanUp.transaction.resetLNode(tx, { elements })
}
