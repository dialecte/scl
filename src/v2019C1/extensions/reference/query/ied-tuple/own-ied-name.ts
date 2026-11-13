import { toRef } from '@dialecte/core/helpers'

import { RELATIVE_IED_NAME } from '@/v2019C1/constants/naming'
import { readAttribute } from '@/v2019C1/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/** The name of the IED a referrer sits in, among its ancestors. */
export function ownIedName(params: { ancestry: readonly AnyRawRecord[] }): string | undefined {
	const ied = params.ancestry.find((ancestor) => ancestor.tagName === 'IED')
	return ied
		? readAttribute({ record: ied, name: 'name', defaults: 'none', fullObject: true })?.value
		: undefined
}

/**
 * The name of the IED a tuple reference sits in, read only when one of its pairs names its IED
 * `iedName="@"`; `undefined` otherwise.
 */
export async function relativeIedName(
	query: Core.Query<Config>,
	params: { record: AnyRawRecord; pairs: readonly TupleReferencePair[] },
): Promise<string | undefined> {
	const { record, pairs } = params
	if (!namesRelativeIed({ record, pairs })) return undefined
	const ancestors = await query.findAncestors(toRef(record) as Scl.Ref<Scl.ElementsOf>)
	return ownIedName({ ancestry: ancestors as AnyRawRecord[] })
}

/** Whether one of the pairs of a tuple reference names its IED `@`. */
export function namesRelativeIed(params: {
	record: AnyRawRecord
	pairs: readonly TupleReferencePair[]
}): boolean {
	const { record, pairs } = params
	return pairs.some(({ tuple }) => {
		const { ied } = tuple
		if (!('attribute' in ied)) return false
		const written = readAttribute({
			record,
			name: ied.attribute,
			defaults: 'none',
			fullObject: true,
		})
		return written?.value === RELATIVE_IED_NAME
	})
}
