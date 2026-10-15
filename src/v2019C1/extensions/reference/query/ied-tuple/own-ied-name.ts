import { toRef } from '@dialecte/core/helpers'

import { RELATIVE_IED_NAME } from '@/v2019C1/constants/naming'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/** The name of the IED a referrer sits in, among its ancestors. */
export function ownIedName(params: { ancestry: readonly AnyRawRecord[] }): string | undefined {
	const ied = params.ancestry.find((ancestor) => ancestor.tagName === 'IED')
	return ied ? readRawAttribute({ record: ied, name: 'name' }) : undefined
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
	const relative = pairs.some(
		({ tuple: { ied } }) =>
			'attribute' in ied && readRawAttribute({ record, name: ied.attribute }) === RELATIVE_IED_NAME,
	)
	if (!relative) return undefined
	const ancestors = await query.findAncestors(toRef(record) as Scl.Ref<Scl.ElementsOf>)
	return ownIedName({ ancestry: ancestors as AnyRawRecord[] })
}
