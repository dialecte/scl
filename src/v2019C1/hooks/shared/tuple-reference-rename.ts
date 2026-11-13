import { namedTargetUuids, partsOf } from './named-target-uuids'
import { followNamesOnlyIedRename } from './names-only-ied-rename'
import { hasAttributeChange } from './record-ops'
import { tupleNamesOperation } from './tuple-names-operation'

import { toRawRecord, toRef } from '@dialecte/core/helpers'

import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { getIdentityFields } from '@/v2019C1/extensions/lifecycle/constraints/identity-fields'
import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { TUPLE_TARGET_KINDS } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.constants'
import { targetTupleParts } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'

import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetParts } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * When an element naming a part of a tuple address is renamed (an IED, an access point, a logical
 * device, a logical node, a control block), the tuple references pointing by uuid at it or at an
 * element below it write the new names (see `tupleReferenceWrite`). A reference that names its target
 * without the uuid is not found this way, except by the IED it names (see `followNamesOnlyIedRename`).
 */
export async function followTupleTargetRename(
	query: Core.Query<Config>,
	params: { oldRecord: Scl.RawRecord<Scl.ElementsOf>; newRecord: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord } = params
	if (newRecord.tagName !== 'IED' && !TUPLE_TARGET_KINDS.has(newRecord.tagName)) return []
	const names = [...getIdentityFields(newRecord.tagName)]
	if (!hasAttributeChange({ oldRecord, newRecord, names })) return []

	const ref = toRef(newRecord) as Scl.Ref<Scl.ElementsOf>
	const { partsByUuid, targetTagByUuid } = await readTargetParts(query, { root: ref })
	const targetTags = new Set(targetTagByUuid.values())
	const operations = await followNamesOnlyIedRename(query, { oldRecord, newRecord })
	if (partsByUuid.size === 0) return operations

	for (const [tagName, tagPairs] of Object.entries(TUPLE_REFERENCE_PAIRS)) {
		const pairs = tagPairs as readonly TupleReferencePair[]
		if (!pairs.some((pair) => pair.target.some((target) => targetTags.has(target)))) continue
		const referrers = await query.getRecordsByTagName(tagName as Scl.ElementsOf)
		for (const referrer of referrers) {
			const record = toRawRecord(referrer) as AnyRawRecord
			const uuids = namedTargetUuids({ record, pairs, targetTagByUuid })
			if (uuids.length === 0) continue
			const operation = await tupleNamesOperation(query, {
				record,
				pairs,
				partsByUuid: partsOf({ uuids, partsByUuid }),
			})
			if (operation) operations.push(operation)
		}
	}
	return operations
}

/** The address parts of every tuple target in a subtree, by uuid, and the tag of each. */
async function readTargetParts(
	query: Core.Query<Config>,
	params: { root: Scl.Ref<Scl.ElementsOf> },
): Promise<{ partsByUuid: Map<string, TupleTargetParts>; targetTagByUuid: Map<string, string> }> {
	const collected = await collectWithAncestry(query, { root: params.root })
	const partsByUuid = new Map<string, TupleTargetParts>()
	const targetTagByUuid = new Map<string, string>()
	for (const record of collected.records) {
		const uuid = await query.any.getAttribute(record, { name: 'uuid' })
		const parts = uuid
			? targetTupleParts({ record, ancestry: collected.ancestryOf(record.id) })
			: undefined
		if (uuid && parts) {
			partsByUuid.set(uuid, parts)
			targetTagByUuid.set(uuid, record.tagName)
		}
	}
	return { partsByUuid, targetTagByUuid }
}
