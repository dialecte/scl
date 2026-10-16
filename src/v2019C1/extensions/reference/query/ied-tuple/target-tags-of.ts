import { readAttribute } from '@/v2019C1/helpers'

import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The tags a reference may point at: the one its own attribute names when the pair says which
 * attribute does (an `ExtRef`'s service names the kind of its control block), else every target.
 */
export function targetTagsOf(params: {
	pair: TupleReferencePair
	record: AnyRawRecord
}): readonly string[] {
	const { pair, record } = params
	if (!pair.targetByAttribute) return pair.target
	const value = readAttribute({
		record,
		name: pair.targetByAttribute.attribute,
		defaults: 'none',
		fullObject: true,
	})?.value
	const named = value === undefined ? undefined : pair.targetByAttribute.tags[value]
	return named ? [named] : pair.target
}
