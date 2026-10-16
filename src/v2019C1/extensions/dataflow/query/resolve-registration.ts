import { REGISTRATION_PRECISION_ORDER } from '../constants/registration.constants'
import { readSubscriber } from './read-subscriber'
import { registrationPrecision } from './registration-precision'

import type { Registration } from '../dataflow.types'
import type { DataflowContext } from './dataflow-context.types'
import type { ControlBlockNode, IedNode } from './ied-section.types'

/**
 * The entry of the subscriber (the IED holding the ExtRef) on a control block: the `IEDName` or
 * `ClientLN` registering it, the most precise one when several do. It names the subscriber's logical
 * node (`ln`), its logical device (`ld`), or an access point of its IED (`ap`). `undefined` when the control block
 * names the subscriber nowhere.
 */
export async function resolveRegistration(params: {
	controlBlock: ControlBlockNode
	extRef: IedNode<'ExtRef'>
	context: DataflowContext
}): Promise<Registration | undefined> {
	const { controlBlock, extRef, context } = params
	const iedSection = await context.iedSection()
	const subscriber = readSubscriber({ extRef, iedSection })

	const registrations: Registration[] = []
	for (const registration of controlBlock.registrations) {
		const names = await registrationPrecision({ context, registration, subscriber })
		if (names) registrations.push({ element: registration.ref as Registration['element'], names })
	}
	return registrations.sort(
		(first, second) =>
			REGISTRATION_PRECISION_ORDER.indexOf(first.names) -
			REGISTRATION_PRECISION_ORDER.indexOf(second.names),
	)[0]
}
