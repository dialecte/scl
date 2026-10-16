import { SIGNAL_PAIRS } from '../constants/signal-pairs.constants'

import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { LinkParams } from './link.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Links a signal to the element implementing it: the signal names it by its uuid, and the address
 * the hooks write from that uuid follows where the element sits relative to the signal's LNode.
 * Whatever address the signal held is removed with the write, so one the hooks cannot compose (an
 * element without an internal address) does not stay.
 */
export async function link(tx: Core.Transaction<Config>, params: LinkParams): Promise<void> {
	const { signal, implementation } = params
	const pair = SIGNAL_PAIRS[signal.tagName].implementation
	invariant((pair.targets as readonly string[]).includes(implementation.tagName), {
		key: SCL_ERRORS.DATAFLOW_LINK_TARGET_MISMATCH,
		meta: {
			signal: { tagName: signal.tagName, id: signal.id },
			implementation: { tagName: implementation.tagName, id: implementation.id },
		},
		detail: `a <${signal.tagName}> cannot be implemented by an <${implementation.tagName}>`,
	})
	const uuid = await tx.any.getAttribute(implementation, { name: 'uuid' })
	invariant(uuid, {
		key: 'ASSERTION_FAILED',
		detail: `the <${implementation.tagName}> "${implementation.id}" has no uuid to name it by`,
	})
	const ancestors = await tx.findAncestors(implementation)
	invariant(
		ancestors.some((ancestor) => ancestor.tagName === 'IED'),
		{
			key: 'ASSERTION_FAILED',
			detail: `the <${implementation.tagName}> "${implementation.id}" is not held by an IED`,
		},
	)

	// `update` removes an attribute given `undefined`; the untyped surface takes string values only
	await tx.any.update(signal, {
		attributes: { [pair.uuid]: uuid, [pair.path]: undefined } as Record<string, string>,
	})
}
