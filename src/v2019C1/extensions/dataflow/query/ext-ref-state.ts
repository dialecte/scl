import {
	EXT_REF_CONTROL_BLOCK,
	EXT_REF_SIGNAL,
	INTERNAL_ADDRESS_ATTRIBUTE,
} from '../constants/ext-ref-state.constants'
import { namesSignal } from './names-signal'

import type { ExtRefState } from '../dataflow.types'

/**
 * The state of an ExtRef, read from its own attributes only: nothing, the internal address alone,
 * the signal it names, that signal with its service and control block (a service published without
 * one needs none), then the internal address as well. The internal address alone is never a binding.
 */
export function extRefState(params: { attributes: Readonly<Record<string, string>> }): ExtRefState {
	const { attributes } = params
	const internalAddress = Boolean(attributes[INTERNAL_ADDRESS_ATTRIBUTE])
	if (!namesSignal({ signal: EXT_REF_SIGNAL, attributes })) {
		return internalAddress ? 'later-binding' : 'empty'
	}
	if (!hasControlBlockIfNeeded(attributes)) return 'expected'
	return internalAddress ? 'bound' : 'subscribed'
}

/**
 * Whether an ExtRef has what its service needs: the service is set, and it either names the control
 * block publishing the signal or is published without one. Without a service nothing else it names
 * counts.
 */
function hasControlBlockIfNeeded(attributes: Readonly<Record<string, string>>): boolean {
	const { names, serviceAttribute, servicesWithControlBlock } = EXT_REF_CONTROL_BLOCK
	const service = attributes[serviceAttribute]
	if (!service) return false
	return names.some((name) => attributes[name]) || !servicesWithControlBlock.has(service)
}
