import { toRawRecord } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'
import { TUPLE_TARGET_KINDS } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { findRecordByUuid, readTargetTupleParts, tupleNamesOperation } from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * A tuple reference naming its target by a uuid (see `TUPLE_REFERENCE_PAIRS`) carries the names of
 * that target too, one reading the other:
 *
 * 1. A reference created with its uuids (an `ExtRef` with `srcCBUuid` only, an `IEDName` with
 *    `apUuid` only) gets the names of the elements they name, when they differ (see
 *    `tupleReferenceWrite`).
 * 2. A target created with a uuid (an access point, a logical device, a logical node, a control
 *    block) gives its names to the references already naming it by that uuid.
 */
export async function writeTupleNamesOfCreated<GenericElement extends Scl.ElementsOf>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, query } = params
	const record = childRecord as unknown as AnyRawRecord
	const asReferrer = await writeNamesOfCreatedReferrer({ record, query })
	const asTarget = await writeNamesOfCreatedTarget({ record, query })
	return [...asReferrer, ...asTarget]
}

/** The reference is the new element: one update writing the names of every element its uuids name. */
async function writeNamesOfCreatedReferrer(params: {
	record: AnyRawRecord
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params
	const pairs: readonly TupleReferencePair[] | undefined =
		TUPLE_REFERENCE_PAIRS[record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS]
	if (!pairs) return []

	const partsByUuid = new Map<string, TupleTargetParts | undefined>()
	for (const pair of pairs) {
		const uuid = readRawAttribute({ record, name: pair.attribute.uuid })
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

/**
 * The target is the new element: the references naming it by its uuid write its names. The
 * referrers are found first; the target's address is read once, and only when one exists.
 */
async function writeNamesOfCreatedTarget(params: {
	record: AnyRawRecord
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params
	const uuid = readRawAttribute({ record, name: 'uuid' })
	if (!uuid || !TUPLE_TARGET_KINDS.has(record.tagName)) return []

	const referrersByTag = await findReferrersByUuid({ record, uuid, query })
	if (referrersByTag.length === 0) return []
	const parts = await readTargetTupleParts(query, { record })
	if (!parts) return []
	const partsByUuid = new Map([[uuid, parts]])

	const operations: Scl.Operation[] = []
	for (const { pairs, referrers } of referrersByTag) {
		for (const referrer of referrers) {
			const operation = await tupleNamesOperation(query, {
				record: toRawRecord(referrer) as AnyRawRecord,
				pairs,
				partsByUuid,
			})
			if (operation) operations.push(operation)
		}
	}
	return operations
}

/** The tuple references naming the target `record` by `uuid`, by referrer tag with that tag's pairs. */
async function findReferrersByUuid(params: {
	record: AnyRawRecord
	uuid: string
	query: Core.Query<Config>
}): Promise<
	{ pairs: readonly TupleReferencePair[]; referrers: Scl.TrackedRecord<Scl.ElementsOf>[] }[]
> {
	const { record, uuid, query } = params
	const found: {
		pairs: readonly TupleReferencePair[]
		referrers: Scl.TrackedRecord<Scl.ElementsOf>[]
	}[] = []
	for (const [tagName, tagPairs] of Object.entries(TUPLE_REFERENCE_PAIRS)) {
		const pairs = tagPairs as readonly TupleReferencePair[]
		const referrers = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
		for (const pair of pairs.filter((pair) => pair.target.includes(record.tagName))) {
			const named = await query.findByAttributes({
				tagName: tagName as Scl.ElementsOf,
				attributes: { [pair.attribute.uuid]: uuid },
			})
			for (const referrer of named as Scl.TrackedRecord<Scl.ElementsOf>[]) {
				referrers.set(referrer.id, referrer)
			}
		}
		if (referrers.size > 0) found.push({ pairs, referrers: [...referrers.values()] })
	}
	return found
}
