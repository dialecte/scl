import { CONTROL_BLOCK_ATTRIBUTES_BY_TAG, SOURCE_ATTRIBUTES_BY_TAG } from './input-source.constants'

import type { InputSourceScope } from './input-source.types'

/**
 * The attributes clearing an input's or output's source removes: its whole source (`data`), it is then unbound, offered
 * for a later binding; or only the control block sending its data (`control-block`), the data kept. None for a tag
 * holding no source (or no control block). Shared by the delete cascade and the update of an IED.
 */
export function clearedInputSource(params: {
	tagName: string
	scope: InputSourceScope
}): readonly string[] {
	const { tagName, scope } = params
	const byTag = scope === 'data' ? SOURCE_ATTRIBUTES_BY_TAG : CONTROL_BLOCK_ATTRIBUTES_BY_TAG
	return byTag.get(tagName) ?? []
}
