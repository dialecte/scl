import { inTagReadOrder } from './in-tag-read-order'
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
import { readAttribute } from '@/v2019C1/helpers'

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

	const named = Object.entries(TUPLE_REFERENCE_PAIRS).flatMap(([tagName, tagPairs]) => {
		const pairs = tagPairs as readonly TupleReferencePair[]
		return pairs.some((pair) => pair.target.some((target) => targetTags.has(target)))
			? [{ tagName: tagName as Scl.ElementsOf, pairs }]
			: []
	})
	const referrersByTag = await Promise.all(
		named.map(function readTag({ tagName, pairs }) {
			return readReferrersByUuid(query, { tagName, pairs, targetTagByUuid })
		}),
	)
	for (const [index, { pairs }] of named.entries()) {
		for (const referrer of referrersByTag[index]) {
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

/**
 * The records of `tagName` naming by a pair's uuid attribute one of the targets given whose tag that pair can name:
 * one lookup per uuid attribute with the list of those uuids, the records in the order a read of the tag lists them.
 */
async function readReferrersByUuid(
	query: Core.Query<Config>,
	params: {
		tagName: Scl.ElementsOf
		pairs: readonly TupleReferencePair[]
		targetTagByUuid: ReadonlyMap<string, string>
	},
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { tagName, pairs, targetTagByUuid } = params
	const uuidsByAttribute = new Map<string, Set<string>>()
	for (const pair of pairs) {
		for (const [uuid, targetTag] of targetTagByUuid) {
			if (!pair.target.includes(targetTag)) continue
			const uuids = uuidsByAttribute.get(pair.attribute.uuid) ?? new Set<string>()
			uuids.add(uuid)
			uuidsByAttribute.set(pair.attribute.uuid, uuids)
		}
	}
	const lookups = await Promise.all(
		[...uuidsByAttribute].map(function searchReferrers([uuidAttribute, uuids]) {
			// dialecte-allow query-in-loop: one search per uuid attribute of the tag, for every target uuid at once
			return query.findByAttributes({
				tagName,
				// the attribute is named at run time: the filter type is per tag, the pair entries say it holds a uuid
				attributes: { [uuidAttribute]: [...uuids] } as never,
			})
		}),
	)
	return inTagReadOrder(query, { tagName, lookups })
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
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none', fullObject: true })?.value
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
