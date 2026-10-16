import { toRef } from '@dialecte/core/helpers'

import { targetTupleParts } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The address parts of an element of the document a tuple reference may name, read from the record
 * (already read by the caller) and one read of the elements above it (see `targetTupleParts`).
 * `undefined` for an element no tuple names, or outside an IED.
 */
export async function readTargetTupleParts(
	query: Core.Query<Config>,
	params: { record: AnyRawRecord },
): Promise<TupleTargetParts | undefined> {
	const { record } = params
	const ancestors = await query.findAncestors(toRef(record) as Scl.Ref<Scl.ElementsOf>)
	return targetTupleParts({ record, ancestry: [...ancestors].reverse() as AnyRawRecord[] })
}
