import { SIGNAL_PAIRS, SOURCE_REF_SERVICE_ATTRIBUTE } from '../constants/signal-pairs.constants'
import { describeImplementation } from './describe-implementation'
import { namesTarget } from './names-target'
import { resolveAllocation } from './resolve-allocation'
import { resolveOther } from './resolve-other'

import { invariant } from '@dialecte/core/utils'

import { PAIRS_BY_REF, RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'

import type { SpecifiedDataflow } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The dataflow a signal (a SourceRef or a ControlRef) describes, read from the signal itself and
 * from the facts of the call: what it specifies, then what implements it.
 */
export async function describeSignal(
	query: Core.Query<Config>,
	params: {
		ref: Scl.Ref<'SourceRef' | 'ControlRef'>
		direction: SpecifiedDataflow['direction']
		context: DataflowContext
	},
): Promise<SpecifiedDataflow> {
	const { ref, direction, context } = params
	const attributes: Readonly<Record<string, string>> = await query.getAttributes(ref)
	const pairs = PAIRS_BY_REF.get(ref.tagName) ?? []
	const { holderOfSignal } = await context.processSection()
	const holder = holderOfSignal.get(ref.id)
	invariant(holder, {
		key: 'ELEMENT_NOT_FOUND',
		ref,
		detail: `the <${ref.tagName}> "${ref.id}" is not held by an LNode of the process section`,
	})
	const other = await resolveOther({
		pairs: SIGNAL_PAIRS[ref.tagName].specification,
		attributes,
		context,
	})
	const allocation = await resolveAllocation({ holder, other: other?.lnode, context })

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
