import { DEFAULT_BOUND_LOGICAL_NODE_TYPES } from './diff-policy.constants'

import type { DiffPolicy } from './diff-policy.types'
import type { Resolution } from '@/v2019C1/extensions/lifecycle/contract.types'

/** The diff policy a `Resolution` states, defaults applied: resolved once per report, never per walk. */
export function readDiffPolicy(params: { resolution?: Resolution }): DiffPolicy {
	const { resolution } = params
	return {
		boundLogicalNodeTypes: resolution?.boundLogicalNodeTypes ?? DEFAULT_BOUND_LOGICAL_NODE_TYPES,
		consumerManagedTags: new Set(resolution?.consumerManagedTags),
	}
}
