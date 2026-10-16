import {
	EXT_CTRL_LATER_BINDING,
	EXT_CTRL_SIGNAL,
	INTERNAL_ADDRESS_ATTRIBUTE,
} from '../constants/ext-ref-state.constants'
import { isLaterBinding } from './is-later-binding'
import { namesSignal } from './names-signal'

import type { ExtCtrlState } from '../dataflow.types'

/**
 * The state of an ExtCtrl, read from its own attributes only: the internal address, nothing of a
 * signal (`later-binding`; the expected data object is optional), or the signal with the internal address
 * (`bound`). Written in any other way, it has no state.
 */
export function extCtrlState(params: {
	attributes: Readonly<Record<string, string>>
}): ExtCtrlState | undefined {
	const { attributes } = params
	if (isLaterBinding({ shape: EXT_CTRL_LATER_BINDING, attributes })) return 'later-binding'
	const signalNamed = namesSignal({ signal: EXT_CTRL_SIGNAL, attributes })
	return signalNamed && attributes[INTERNAL_ADDRESS_ATTRIBUTE] ? 'bound' : undefined
}
