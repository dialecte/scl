import { getAttributeRules } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { readAttribute } from '@/v2019C1/helpers'

import type { TupleReferencePair, TupleRole } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The value a tuple reference gives a part of its target's address: its attribute as written, else
 * the attribute the pair names for it when the reference leaves it out, else its schema value;
 * `undefined` when none.
 */
export function tupleRoleValue(params: {
	record: AnyRawRecord
	pair: TupleReferencePair
	role: TupleRole
}): string | undefined {
	const { record, pair, role } = params
	const name = pair.tuple[role]
	if (!name) return undefined
	const written = readAttribute({ record, name, defaults: 'none', fullObject: true })?.value
	if (written !== undefined) return written
	const otherwise = pair.otherwise?.[role]
	const instead = otherwise
		? readAttribute({ record, name: otherwise, defaults: 'none', fullObject: true })?.value
		: undefined
	if (instead !== undefined) return instead
	const rules = getAttributeRules({
		dialecteConfig: SCL_DIALECTE_CONFIG,
		record,
		attributeName: name,
	})
	return rules.fixed ?? rules.default
}
