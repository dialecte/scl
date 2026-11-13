import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { iedNameOf } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-name-of'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTagsOf } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tags-of'
import { targetTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tuple-address'
import { tuplePairApplies } from '@/v2019C1/extensions/reference/query/ied-tuple/tuple-pair-applies'
import { readAttribute } from '@/v2019C1/helpers'

import type { ReferenceViolation } from './assert-coherent-scl-references.types'
import type { CollectTupleViolationsParams } from './collect-tuple-violations.types'
import type { TreeEntry } from './tree-entries.types'
import type { TupleReferencePair } from '@/v2019C1/constants'

/**
 * The tuple references of an element (`TUPLE_REFERENCE_PAIRS`: `ExtRef`, `FCDA`, `ConnectedAP`, a bound LNode...) a
 * real file could not contain: a uuid naming nothing in an IED the document holds (`dangling`; one naming an element of
 * an IED the document does not hold is outside it, not checked), naming an element the reference cannot point at
 * (`wrong-target`), or names that are not the address of the element the uuid names (`path`, the addresses compared).
 * Names left out are not reported: the hooks write them.
 */
export function collectTupleViolations(params: CollectTupleViolationsParams): ReferenceViolation[] {
	const { element } = params
	const pairs: readonly TupleReferencePair[] =
		TUPLE_REFERENCE_PAIRS[element.record.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? []
	return pairs.flatMap((pair) => collectTuplePairViolations({ ...params, pair }))
}

function collectTuplePairViolations(
	params: CollectTupleViolationsParams & { pair: TupleReferencePair },
): ReferenceViolation[] {
	const { element, pair, elementsByUuid, iedNames } = params
	const { record, ancestors } = element
	if (!tuplePairApplies({ record, pair })) return []
	const uuid = readAttribute({
		record,
		name: pair.attribute.uuid,
		defaults: 'none',
		fullObject: true,
	})?.value
	if (uuid === undefined) return []

	const referenceTagName = record.tagName
	const uuidAttribute = pair.attribute.uuid
	const carriers = elementsByUuid.get(uuid) ?? []
	if (carriers.length === 0) {
		const ied = iedNameOf({ role: pair.tuple.ied, record, ancestry: ancestors })
		if (ied === undefined || !iedNames.has(ied)) return []
		return [{ kind: 'dangling', referenceTagName, uuidAttribute, uuid }]
	}

	const targetTagNames = targetTagsOf({ pair, record })
	const target = carriers.find((candidate) => targetTagNames.includes(candidate.record.tagName))
	if (!target) {
		const targetTagName = carriers[0].record.tagName
		return [{ kind: 'wrong-target', referenceTagName, uuidAttribute, uuid, targetTagName }]
	}

	const written = referrerTupleAddress({ pair, record, ancestry: ancestors })
	const expected = targetTupleAddress({ record: target.record, ancestry: target.ancestors })
	if (!written || !expected || written === expected) return []
	return [
		{
			kind: 'path',
			referenceTagName,
			pathAttribute: namesOf({ element, pair }).join(' '),
			uuidAttribute,
			uuid,
			written,
			expected,
		},
	]
}

/** The attributes naming the target of a tuple pair, as the shared reference readers list them. */
function namesOf(params: { element: TreeEntry; pair: TupleReferencePair }): readonly string[] {
	const { element, pair } = params
	const references = REFERENCE_UUIDS_BY_TAG.get(element.record.tagName) ?? []
	return references.find((reference) => reference.uuid === pair.attribute.uuid)?.names ?? []
}
