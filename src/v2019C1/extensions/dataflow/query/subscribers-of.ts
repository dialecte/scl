import { LEAST_PRECISE_REGISTRATION } from '../constants/registration.constants'
import { createDataflowContext } from './dataflow-context'
import { describeDocument } from './describe-document'
import { registrationPrecision } from './registration-precision'

import { invariant } from '@dialecte/core/utils'

import type { ControlBlockSubscribers, Registration } from '../dataflow.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Query extension: what subscribes to a control block. Its registrations (the `IEDName` and
 * `ClientLN` it holds), each with how precisely it names its subscriber; the ExtRefs naming it, by
 * uuid or by names; and the dataflows of those ExtRefs, specified or not.
 */
export async function subscribersOf(
	query: Core.Query<Config>,
	params: { controlBlock: Scl.Ref<'GSEControl' | 'SampledValueControl' | 'ReportControl'> },
): Promise<ControlBlockSubscribers> {
	const { controlBlock: ref } = params
	const context = createDataflowContext(query)
	const { controlBlocks } = await context.iedSection()
	const controlBlock = controlBlocks.get(ref.id)
	invariant(controlBlock, {
		key: 'ELEMENT_NOT_FOUND',
		ref,
		detail: `the <${ref.tagName}> "${ref.id}" is not a control block of an IED`,
	})

	const extRefs = (await context.extRefsByControlBlock()).get(ref.id) ?? []
	const elementIds = new Set(extRefs.map((extRef) => extRef.record.id))
	const dataflows = await describeDocument({ context })

	return {
		registrations: controlBlock.registrations.map((registration) => ({
			element: registration.ref as Registration['element'],
			names: registrationPrecision({ registration }) ?? LEAST_PRECISE_REGISTRATION,
		})),
		elements: extRefs.map((extRef) => extRef.ref),
		dataflows: dataflows.filter(({ implementation }) =>
			implementation.element ? elementIds.has(implementation.element.id) : false,
		),
	}
}
