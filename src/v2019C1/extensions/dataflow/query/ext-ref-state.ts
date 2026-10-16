import {
	EXT_REF_CONTROL_BLOCK,
	EXT_REF_LATER_BINDING,
	EXT_REF_SIGNAL,
	INTERNAL_ADDRESS_ATTRIBUTE,
} from '../constants/ext-ref-state.constants'
import { isLaterBinding } from './is-later-binding'
import { namesSignal } from './names-signal'

import type { ExtRefState } from '../dataflow.types'

/**
 * The state of an ExtRef, read from its own attributes only: the internal address and the expected
 * data object, nothing of a signal, a service or a control block (`later-binding`); the signal alone (`expected`); the signal with its service and control block
 * (`subscribed`; a service published without one needs none), and the internal address as well
 * (`bound`). Written in any other way, it has no state.
 */
export function extRefState(params: {
	attributes: Readonly<Record<string, string>>
}): ExtRefState | undefined {
	const { attributes } = params
	if (isLaterBinding({ shape: EXT_REF_LATER_BINDING, attributes })) return 'later-binding'
	if (!namesSignal({ signal: EXT_REF_SIGNAL, attributes })) return undefined
	const internalAddress = Boolean(attributes[INTERNAL_ADDRESS_ATTRIBUTE])
	if (hasControlBlockIfNeeded(attributes)) return internalAddress ? 'bound' : 'subscribed'
	return internalAddress || namesControlBlock(attributes) ? undefined : 'expected'
}

/**
 * Whether an ExtRef has what its service needs: the service is set, and it either names the control
 * block publishing the signal or is published without one. Without a service nothing else it names
 * counts.
 */
function hasControlBlockIfNeeded(attributes: Readonly<Record<string, string>>): boolean {
	const { serviceAttribute, servicesWithControlBlock } = EXT_REF_CONTROL_BLOCK
	const service = attributes[serviceAttribute]
	if (!service) return false
	return namesControlBlock(attributes) || !servicesWithControlBlock.has(service)
}

/** Whether an ExtRef names a control block, by its uuid or by its name. */
function namesControlBlock(attributes: Readonly<Record<string, string>>): boolean {
	return EXT_REF_CONTROL_BLOCK.names.some((name) => attributes[name])
}
