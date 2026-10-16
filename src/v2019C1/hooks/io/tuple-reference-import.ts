import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetKey } from '@/v2019C1/extensions/reference/query/ied-tuple/target-key'
import { targetTagsOf } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tags-of'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'

import type { PendingTupleFill, TupleReferenceImport } from './tuple-reference-import.types'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

/**
 * Gives every imported tuple reference written without its uuid (a `ConnectedAP` without `apUuid`,
 * an `ExtRef` without `lnUuid`...) the uuid of the element its names name in the file. The import
 * has no store access: the pass keeps each target under its address and tag, and each reference to
 * fill; the uuids are written at the end. A name naming nothing in the file (another device, for a
 * file of one device), or naming several elements a reference cannot tell apart, is left as it is.
 */
export function createTupleReferenceImport(): TupleReferenceImport {
	const targetsByAddress = new Map<string, string>()
	const pendingFills: PendingTupleFill[] = []

	function collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void {
		const { record, ancestry } = params
		const uuid = readRawAttribute({ record, name: 'uuid' })
		if (uuid) {
			const address = targetTupleAddress({ record, ancestry })
			if (address) targetsByAddress.set(targetKey({ address, tagName: record.tagName }), uuid)
		}

		const pairs: readonly TupleReferencePair[] | undefined =
			TUPLE_REFERENCE_PAIRS[record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS]
		for (const pair of pairs ?? []) {
			if (readRawAttribute({ record, name: pair.attribute.uuid })) continue
			const address = referrerTupleAddress({ pair, record, ancestry })
			if (!address) continue
			pendingFills.push({
				recordId: record.id,
				uuidAttribute: pair.attribute.uuid,
				address,
				targetTags: targetTagsOf({ pair, record }),
			})
		}
	}

	function resolve(): { updates: RecordPatch[] } {
		const updates: RecordPatch[] = []
		for (const { recordId, uuidAttribute, address, targetTags } of pendingFills) {
			const uuids = targetTags.flatMap((tagName) => {
				const uuid = targetsByAddress.get(targetKey({ address, tagName }))
				return uuid ? [uuid] : []
			})
			// several elements answer (control blocks of different kinds sharing a name): none is chosen
			if (uuids.length === 1)
				updates.push({ recordId, attributes: [{ name: uuidAttribute, value: uuids[0] }] })
		}
		targetsByAddress.clear()
		pendingFills.length = 0
		return { updates }
	}

	return { collect, resolve }
}
