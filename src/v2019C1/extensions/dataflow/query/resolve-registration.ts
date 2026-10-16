import { REGISTRATION_PRECISION_ORDER } from '../constants/registration.constants'
import { readSubscriber } from './read-subscriber'
import { registrationPrecision } from './registration-precision'

import type { Registration } from '../dataflow.types'
import type { ControlBlockNode, IedNode, IedSection } from './ied-section.types'

/**
 * The entry of the subscriber (the IED holding the ExtRef) on a control block: the `IEDName` or
 * `ClientLN` registering it, the most precise one when several do. It names the subscriber's logical
 * node (`ln`), its logical device (`ld`), or an access point of its IED (`ap`). `undefined` when the control block
 * names the subscriber nowhere.
 */
export function resolveRegistration(params: {
	controlBlock: ControlBlockNode
	extRef: IedNode<'ExtRef'>
	iedSection: IedSection
}): Registration | undefined {
	const { controlBlock, extRef, iedSection } = params
	const subscriber = readSubscriber({ extRef, iedSection })

	const registrations = controlBlock.registrations.flatMap((registration) => {
		const names = registrationPrecision({ registration, subscriber })
		return names ? [{ element: registration.ref as Registration['element'], names }] : []
	})
	return registrations.sort(
		(first, second) =>
			REGISTRATION_PRECISION_ORDER.indexOf(first.names) -
			REGISTRATION_PRECISION_ORDER.indexOf(second.names),
	)[0]
}
