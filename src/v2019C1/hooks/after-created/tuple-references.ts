import { toRawRecord } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { pairsWrittenWhenSet } from '@/v2019C1/extensions/reference/query/ied-tuple/pairs-written-when-set'
import { findRecordByUuid, readTargetTupleParts, tupleNamesOperation } from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * A tuple reference created with its uuids (an `ExtRef` with `srcCBUuid` only, an `IEDName` with
 * `apUuid` only) gets the names of the elements they name, when they differ (see `tupleReferenceWrite`),
 * but for a `followsOnly` pair, an LNode's `lnUuid`, whose binding writes the names: one update. The
 * references naming a target the transaction creates are written at the commit
 * (`writeTupleNamesOfCreatedTargets`), once for all the targets.
 */
export async function writeTupleNamesOfCreatedReferrer<
	GenericElement extends Scl.ElementsOf,
>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params
	const record = childRecord as unknown as AnyRawRecord
	const pairs = pairsWrittenWhenSet({
		pairs: TUPLE_REFERENCE_PAIRS[record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? [],
	})
	if (pairs.length === 0) return []

	const partsByUuid = new Map<string, TupleTargetParts | undefined>()
	for (const pair of pairs) {
		const uuid = await query.any.getAttribute(record, { name: pair.attribute.uuid })
		if (!uuid || partsByUuid.has(uuid)) continue
		const target = await findRecordByUuid(query, { uuid, targetTagNames: pair.target })
		const parts = target
			? await readTargetTupleParts(query, { record: toRawRecord(target) as AnyRawRecord })
			: undefined
		partsByUuid.set(uuid, parts)
	}
	if (partsByUuid.size === 0) return []

	const operation = await tupleNamesOperation(query, { record, pairs, partsByUuid })
	return operation ? [operation] : []
}
