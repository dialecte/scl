import { readAncestries } from './tuple-names'

import { indexTupleTargets } from '@/v2019C1/extensions/reference/query/ied-tuple/index-tuple-targets'
import { referrerTupleAddress } from '@/v2019C1/extensions/reference/query/ied-tuple/referrer-tuple-address'
import { targetTagsOf } from '@/v2019C1/extensions/reference/query/ied-tuple/target-tags-of'
import { resolveTupleUuid } from '@/v2019C1/hooks/shared/tuple-reference-resolve'

import type { NamedBefore, RecordChange, ReferenceWork } from './tuple-references.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * For each reference the transaction did not write (`waiting`), the uuid each of its pairs' names named before the
 * transaction, by uuid attribute: the targets and the elements above them as they were (a renamed one with its former
 * names, a moved one below its former parent, even when it now sits in an element the transaction created), a target
 * the transaction created left out. A rename or a move then
 * binds a waiting reference only when its names come to name an element they did not name: never when they named it
 * already (its access point renamed, its own IED renamed under a reference naming that IED by where it sits).
 *
 * Perf: no read without a move; with moves, the elements above their former parents, a level at a time.
 */
export async function readNamedBefore(params: {
	query: Core.Query<Config>
	changes: ReadonlyMap<string, RecordChange>
	waiting: readonly ReferenceWork[]
	targets: readonly AnyRawRecord[]
	ancestries: ReadonlyMap<string, AnyRawRecord[]>
	held?: ReadonlyMap<string, AnyRawRecord>
}): Promise<NamedBefore> {
	const { query, changes, waiting, targets, ancestries, held } = params
	const named = new Map<string, ReadonlyMap<string, string>>()
	if (waiting.length === 0) return named
	const formerById = new Map<string, AnyRawRecord>()
	const created = new Set<string>()
	const moved: AnyRawRecord[] = []
	for (const { before, after } of changes.values()) {
		if (!before) {
			created.add(after.id)
			continue
		}
		formerById.set(after.id, before)
		if (before.parent?.id !== after.parent?.id) moved.push(before)
	}
	// the elements above each moved record's former parent (as the store holds them now)
	const aboveFormerParent =
		moved.length > 0 ? await readAncestries({ records: moved, query, held }) : new Map()

	/** A record as it was before the transaction. */
	function formerOf(record: AnyRawRecord): AnyRawRecord {
		return formerById.get(record.id) ?? record
	}

	/** An ancestry as it was: its elements with their former names, the part above a moved one its former one. */
	function asItWas(ancestry: readonly AnyRawRecord[]): AnyRawRecord[] {
		for (let position = ancestry.length - 1; position >= 0; position--) {
			const above = aboveFormerParent.get(ancestry[position].id)
			if (above) return [...asItWas(above), ...ancestry.slice(position).map(formerOf)]
		}
		return ancestry.map(formerOf)
	}

	/** The elements that were above `record`. */
	function formerAncestry(record: AnyRawRecord): AnyRawRecord[] {
		return asItWas(aboveFormerParent.get(record.id) ?? ancestries.get(record.id) ?? [])
	}

	// every record the transaction created is in `created`; one moved into a created element was there, below its former parent
	const formerTargets = targets.filter((target) => !created.has(target.id)).map(formerOf)
	const formerIndex = indexTupleTargets({
		targets: formerTargets,
		ancestries: new Map(formerTargets.map((target) => [target.id, formerAncestry(target)])),
	})
	for (const { record, pairs } of waiting) {
		const ancestry = formerAncestry(record)
		const uuids = new Map<string, string>()
		for (const { pair } of pairs) {
			const address = referrerTupleAddress({ pair, record, ancestry })
			const uuid = address
				? resolveTupleUuid({
						address,
						targetTags: targetTagsOf({ pair, record }),
						targetsByAddress: formerIndex.byAddress,
					})
				: undefined
			if (uuid) uuids.set(pair.attribute.uuid, uuid)
		}
		named.set(record.id, uuids)
	}
	return named
}
