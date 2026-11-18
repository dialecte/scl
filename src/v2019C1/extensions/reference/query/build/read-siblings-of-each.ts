import { toRawRecord } from '@dialecte/core/helpers'

import type { SignalPlace } from './read-siblings-of-each.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The direct children of each parent of the signal tag given with it, in the order of the parent's children; `[]`
 * for a parent that names no element (a ref without an id included: it is not looked up by tag) or holds no direct
 * child of the tag. A signal is a direct child of its parent: a transparent element (`Private`) is never looked into.
 *
 * Perf: the distinct parents in one `getRecords`, then one `getChildrenOfEach` per distinct tag, the parents given as
 * read: 1 + one store read per signal tag, at most 3 whatever the number of places.
 */
export async function readSignalChildrenOfEach(params: {
	query: Core.Query<Config>
	places: readonly SignalPlace[]
}): Promise<Core.AnyRawRecord[][]> {
	const { query, places } = params
	const parentRefs = [
		...new Map(
			places.flatMap((place) =>
				place.parent.id ? [[place.parent.id, place.parent] as const] : [],
			),
		).values(),
	]
	const parents = parentRefs.length > 0 ? await query.getRecords(parentRefs) : []
	const parentById = new Map(
		parents.flatMap((parent) => (parent ? [[parent.id, parent] as const] : [])),
	)

	const tagNames = [...new Set(places.map((place) => place.tagName))]
	const childrenByTag = await Promise.all(
		tagNames.map(function readChildrenOfTag(tagName) {
			return readChildrenOfTagOfEach({ query, parentById, places, tagName })
		}),
	)
	const byTag = new Map(tagNames.map((tagName, index) => [tagName, childrenByTag[index]]))
	return places.map((place) => byTag.get(place.tagName)?.get(place.parent.id ?? '') ?? [])
}

/**
 * The siblings of each signal (SourceRef, ControlRef): the children of its parent of its tag, the signal included,
 * in the order of the parent's children. A record with no parent, or whose parent names no element or holds no child
 * of its tag, answers itself alone. Signals of one parent and tag share one list.
 *
 * Perf: as `readSignalChildrenOfEach`, at most 3 store reads whatever the number of signals.
 */
export async function readSiblingsOfEach(params: {
	query: Core.Query<Config>
	records: readonly Core.AnyRawRecord[]
}): Promise<Core.AnyRawRecord[][]> {
	const { query, records } = params
	const placed = records.filter((record) => Boolean(record.parent))
	const children = await readSignalChildrenOfEach({
		query,
		places: placed.map((record) => ({
			parent: record.parent as Scl.Ref<Scl.ElementsOf>,
			tagName: record.tagName,
		})),
	})
	const siblingsById = new Map(placed.map((record, index) => [record.id, children[index]]))
	return records.map((record) => {
		const siblings = siblingsById.get(record.id)
		return siblings && siblings.length > 0 ? siblings : [record]
	})
}

/**
 * The children of `tagName` of each distinct parent read that a place of that tag names, by parent id; only the
 * parents holding a direct child of the tag are asked, so `getChildrenOfEach` never reads their transparent wrappers.
 */
async function readChildrenOfTagOfEach(params: {
	query: Core.Query<Config>
	parentById: ReadonlyMap<string, Scl.TrackedRecord<Scl.ElementsOf>>
	places: readonly SignalPlace[]
	tagName: string
}): Promise<Map<string, Core.AnyRawRecord[]>> {
	const { query, parentById, places, tagName } = params
	const parents = [
		...new Map(
			places.flatMap((place) => {
				const parent =
					place.tagName === tagName && place.parent.id ? parentById.get(place.parent.id) : undefined
				const holdsTag = parent?.children.some((child) => child.tagName === tagName)
				return parent && holdsTag ? [[parent.id, parent] as const] : []
			}),
		).values(),
	]
	if (parents.length === 0) return new Map()
	const children = await query.getChildrenOfEach(parents, {
		tagName: tagName as Scl.ChildrenOf<Scl.ElementsOf>,
	})
	return new Map(
		parents.map((parent, index) => [
			parent.id,
			children[index].map((child) => toRawRecord(child) as Core.AnyRawRecord),
		]),
	)
}
