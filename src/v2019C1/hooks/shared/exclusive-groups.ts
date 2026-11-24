import { EXCLUSIVE_REFERENCE_TAGS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { AnyRawRecord } from '@dialecte/core'

/** The attributes of one group of a reference: its path, its uuid, then its data names. */
export function groupAttributeNames(params: { pair: ReferencePair }): string[] {
	const { pair } = params
	return [
		pair.attribute.path,
		pair.attribute.uuid,
		...pair.companions.map((companion) => companion.name),
	]
}

/**
 * The reference attributes `record` holds, pair by pair in the registry's order (path, uuid, data names), when its tag
 * names its target by the attributes of one pair only (`EXCLUSIVE_REFERENCE_TAGS`) and it holds those of two;
 * `undefined` otherwise.
 */
export function exclusiveGroupsHeld(params: {
	record: AnyRawRecord
	pairs: readonly ReferencePair[]
}): string[] | undefined {
	const { record, pairs } = params
	if (!EXCLUSIVE_REFERENCE_TAGS.has(record.tagName)) return undefined
	const groups = pairs
		.map(function heldOfGroup(pair) {
			return groupAttributeNames({ pair }).filter((name) =>
				readAttribute({ record, name, defaults: 'none' }),
			)
		})
		.filter((held) => held.length > 0)
	return groups.length > 1 ? groups.flat() : undefined
}
