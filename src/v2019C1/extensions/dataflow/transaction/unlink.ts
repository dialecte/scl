import { SIGNAL_PAIRS } from '../constants/signal-pairs.constants'

import type { UnlinkParams } from './unlink.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Unlinks a signal from the element implementing it: the uuid naming it and the address written from it are removed. */
export async function unlink(tx: Core.Transaction<Config>, params: UnlinkParams): Promise<void> {
	const { signal } = params
	const pair = SIGNAL_PAIRS[signal.tagName].implementation

	const removed: Record<string, string | undefined> = {
		[pair.uuid]: undefined,
		[pair.path]: undefined,
	}
	// `update` removes an attribute given `undefined`; the untyped surface takes string values only
	await tx.any.update(signal, { attributes: removed as Record<string, string> })
}
