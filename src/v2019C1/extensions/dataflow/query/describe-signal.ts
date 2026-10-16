import {
	SIGNAL_DIRECTION,
	SIGNAL_PAIRS,
	SOURCE_REF_SERVICE_ATTRIBUTE,
} from '../constants/signal-pairs.constants'
import { describeImplementation } from './describe-implementation'
import { namesTarget } from './names-target'
import { resolveAllocation } from './resolve-allocation'
import { resolveOther } from './resolve-other'

import { invariant } from '@dialecte/core/utils'

import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type { SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { Scl } from '@/v2019C1/config'

/**
 * The dataflow a signal (a SourceRef or a ControlRef) describes, read from the signal itself and
 * from the facts of the call: what it specifies, then what implements it.
 */
export async function describeSignal(params: {
	ref: Scl.Ref<'SourceRef' | 'ControlRef'>
	context: DataflowContext
}): Promise<SpecifiedDataflow> {
	const { ref, context } = params
	const direction = SIGNAL_DIRECTION[ref.tagName]
	const pairs = PAIRS_BY_REF.get(ref.tagName) ?? []
	const { signals, holderOfSignal } = await context.processSection()
	const signal = signals.get(ref.id)
	const holder = holderOfSignal.get(ref.id)
	invariant(signal && holder, {
		key: 'ELEMENT_NOT_FOUND',
		ref,
		detail: `the <${ref.tagName}> "${ref.id}" is not held by an LNode of the process section`,
	})
	// the signal's attributes, read from the record the section holds
	const attributes = await context.query.any.getAttributes(signal.record)
	const other = await resolveOther({
		pairs: SIGNAL_PAIRS[ref.tagName].specification,
		attributes,
		context,
	})
	const { allocation, mappedIeds } = await resolveAllocation({
		holder,
		other: other?.lnode,
		context,
	})

	return {
		kind: 'specified',
		signal: ref,
		direction,
		specification: {
			state: namesTarget({ pairs, resolution: RESOLUTION_TYPE.lnode, attributes })
				? 'connected'
				: 'open',
			service: direction === 'input' ? attributes[SOURCE_REF_SERVICE_ATTRIBUTE] : undefined,
			holder: holder.ref,
			other: other && { lnode: other.lnode.ref, ...other.data },
			allocation,
			mappedIeds,
		},
		implementation: await describeImplementation({
			ref,
			holder,
			otherFound: other !== undefined,
			attributes,
			context,
		}),
	}
}
