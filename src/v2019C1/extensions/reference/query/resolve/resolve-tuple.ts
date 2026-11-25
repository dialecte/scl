import { SCL_NAMESPACES } from '@/v2019C1/config/dialecte.config'
import { TUPLE_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { toAnyRawRecord } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.helpers'
import { indexTupleTargets } from '@/v2019C1/extensions/reference/query/ied-tuple/index-tuple-targets'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTagsOf } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tags-of'
import { readAttribute } from '@/v2019C1/helpers'
import { resolveTupleUuid } from '@/v2019C1/hooks/shared/tuple-reference-resolve'

import type { ResolvedTuplePair, TupleReferenceDraft, TupleToResolve } from './resolve-tuple.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TupleReferencePair } from '@/v2019C1/constants'
import type { TupleTargetIndex } from '@/v2019C1/extensions/reference/query/ied-tuple/ied-tuple.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The element each pair of a tuple reference names by its names (an `ExtRef`'s logical node and control block, an
 * `FCDA`'s logical node, an `IEDName`'s access point or device...), read as the commit reads them: `reference` is the
 * reference as the caller is about to write it (its attributes and, for an `IEDName`, its text), `parent` the element
 * it will sit in (a reference naming its IED by where it sits, `@` or its ancestor IED, reads it from there). One entry
 * per pair whose names name exactly one element, in the registry's order: nothing for a pair naming no element, or
 * several, or set aside by the reference's other names, nor for a pair bound by its uuid only (an `LNode`'s). The commit
 * never binds a reference created by names to an element that was there before: write the uuid this answers with the
 * names. Many references: `resolveTuples`, its reads shared.
 *
 * Perf: as `resolveTuples` for one reference.
 *
 * @intent bind a reference created by names, find the element an ExtRef or FCDA names by its names, resolve a tuple reference's names to a uuid
 */
export async function resolveTuple(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: TupleToResolve,
): Promise<ResolvedTuplePair[]> {
	const [resolved = []] = await resolveTuples(query, { references: [params] })
	return resolved
}

/**
 * The answer of `resolveTuple` for each of `references`, in input order (a parent naming nothing answers nothing).
 *
 * Perf: each target tag of every reference's pairs read once, the parents in one read, the elements above the targets
 * and the parents in one `findAncestorsOfEach` (a read per level), whatever the number of references.
 *
 * @intent bind many references created by names, resolve the names of many tuple references to uuids in one pass
 */
export async function resolveTuples(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { references: readonly TupleToResolve[] },
): Promise<ResolvedTuplePair[][]> {
	const asked = params.references.map(({ reference, parent }) => ({
		reference,
		parent,
		pairs: (
			TUPLE_REFERENCE_PAIRS[reference.tagName as keyof typeof TUPLE_REFERENCE_PAIRS] ?? []
		).filter((pair: TupleReferencePair) => !pair.followsOnly) as readonly TupleReferencePair[],
	}))
	const toRead = asked.filter(({ pairs }) => pairs.length > 0)
	if (toRead.length === 0) return asked.map(() => [])
	const { parents, ancestries, index } = await readTupleIndex({ query, asked: toRead })
	return asked.map(function resolvedReference({ reference, parent, pairs }) {
		const holder = parent.id ? parents.get(parent.id) : undefined
		if (!holder) return []
		const record = draftRecordOf({ reference, parent: holder })
		const ancestry = [...(ancestries.get(holder.id) ?? []), holder]
		return pairs.flatMap(function resolvedPair(pair) {
			const address = referrerTupleAddress({ pair, record, ancestry })
			if (!address) return []
			const uuid = resolveTupleUuid({
				address,
				targetTags: targetTagsOf({ pair, record }),
				targetsByAddress: index.byAddress,
			})
			const target = uuid ? index.byUuid.get(uuid) : undefined
			if (!uuid || !target) return []
			return [
				{
					uuidAttribute: pair.attribute.uuid,
					uuid,
					target: { tagName: target.tagName, id: target.id } as Scl.Ref<Scl.ElementsOf>,
				},
			]
		})
	})
}

/**
 * The parents of the references asked, the tuple targets their pairs may name, indexed by address and by uuid, and the
 * elements above the targets and the parents (a vendor wrapper kept): each tag read once, the parents in one read, the
 * ancestors in one `findAncestorsOfEach`.
 */
async function readTupleIndex(params: {
	query: Core.Query<Config> | Core.Transaction<Config>
	asked: readonly (TupleToResolve & { pairs: readonly TupleReferencePair[] })[]
}): Promise<{
	parents: Map<string, AnyRawRecord>
	ancestries: Map<string, AnyRawRecord[]>
	index: TupleTargetIndex
}> {
	const { query, asked } = params
	const parentRefs = [...new Map(asked.map(({ parent }) => [parent.id, parent])).values()]
	const parentRecords = await query.getRecords(parentRefs)
	const parents = new Map(
		parentRecords.flatMap((found) => (found ? [[found.id, toAnyRawRecord(found)] as const] : [])),
	)
	const tags = [...new Set(asked.flatMap(({ pairs }) => pairs.flatMap((pair) => pair.target)))]
	const read = await Promise.all(
		tags.map(function readTag(tagName) {
			// dialecte-allow query-in-loop: one read per target tag of the references' pairs
			return query.getRecordsByTagName(tagName as Scl.ElementsOf)
		}),
	)
	const targets = read
		.flat()
		.map(toAnyRawRecord)
		.filter((target) => readAttribute({ record: target, name: 'uuid', defaults: 'none' }))
	// the ancestors up to the IED, a vendor wrapper kept: a target in vendor payload names nothing
	const climbers = [...targets, ...parents.values()]
	const ancestriesOfEach = await query.findAncestorsOfEach(
		climbers as Scl.RawRecord<Scl.ElementsOf>[],
		{
			order: 'top-down',
			stopAtTagName: 'IED',
			unwrap: [],
		},
	)
	const ancestries = new Map(
		climbers.map((record, position) => [
			record.id,
			(ancestriesOfEach[position] ?? []).map(toAnyRawRecord),
		]),
	)
	return { parents, ancestries, index: indexTupleTargets({ targets, ancestries }) }
}

/** The reference as a record would hold it once written below `parent`, its attributes those the caller gives. */
function draftRecordOf(params: {
	reference: TupleReferenceDraft
	parent: AnyRawRecord
}): AnyRawRecord {
	const { reference, parent } = params
	return {
		id: '',
		tagName: reference.tagName,
		namespace: SCL_NAMESPACES.default,
		attributes: Object.entries(reference.attributes).map(([name, value]) => ({ name, value })),
		value: reference.value ?? '',
		parent: { tagName: parent.tagName, id: parent.id },
		children: [],
	} as AnyRawRecord
}
