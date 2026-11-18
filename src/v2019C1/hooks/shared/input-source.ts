import {
	CONTROL_BLOCK_ATTRIBUTES_BY_TAG,
	INTERNAL_ADDRESS_ATTRIBUTE,
	SOURCE_ATTRIBUTES_BY_TAG,
} from './input-source.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type { InputSourceEffect, InputSourceScope } from './input-source.types'
import type { AnyRawRecord } from '@dialecte/core'

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

/**
 * What losing its source does to an input or output: its whole source going and no internal address held, it holds
 * nothing of its own and goes (`deleted`); else its source attributes are cleared (`cleared`, those of
 * {@link clearedInputSource}), it is kept. One rule for the delete cascade and the update of an IED.
 */
export function inputSourceEffect(params: {
	record: AnyRawRecord
	scope: InputSourceScope
}): InputSourceEffect {
	const { record, scope } = params
	const internalAddress = readAttribute({
		record,
		name: INTERNAL_ADDRESS_ATTRIBUTE,
		defaults: 'none',
	})
	if (scope === 'data' && !internalAddress) return { effect: 'deleted' }
	return { effect: 'cleared', attributes: clearedInputSource({ tagName: record.tagName, scope }) }
}
