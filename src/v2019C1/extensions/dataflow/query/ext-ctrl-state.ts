import { EXT_CTRL_SIGNAL, INTERNAL_ADDRESS_ATTRIBUTE } from '../constants/ext-ref-state.constants'
import { namesSignal } from './names-signal'

import type { ExtCtrlState } from '../dataflow.types'

/** The state of an ExtCtrl, read from its own attributes only: nothing, the internal address, the signal, both. */
export function extCtrlState(params: {
	attributes: Readonly<Record<string, string>>
}): ExtCtrlState {
	const { attributes } = params
	const internalAddress = Boolean(attributes[INTERNAL_ADDRESS_ATTRIBUTE])
	if (!namesSignal({ signal: EXT_CTRL_SIGNAL, attributes })) {
		return internalAddress ? 'later-binding' : 'empty'
	}
	return internalAddress ? 'bound' : 'expected'
}
