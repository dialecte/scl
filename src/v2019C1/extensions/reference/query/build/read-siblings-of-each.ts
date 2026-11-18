import { toRawRecord } from '@dialecte/core/helpers'

import { SIGNAL_TAG_NAMES } from '@/v2019C1/extensions/reference/constants/path-extraction'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The signals (SourceRef, ControlRef) among the direct children of each parent, in the order of the parent's
 * children; `[]` for a parent that names no element (a ref without an id included: it is not looked up by tag) or
 * holds no signal of its own. A transparent element (`Private`) below the parent is never looked into: a signal is a
 * child of the element that holds it.
 *
 * Perf: the distinct parents in one `getRecords`, then one `getChildrenOfEach` per signal tag some parent holds, the
 * parents given as read: at most 3 store reads whatever the number of parents.
 */
export async function readSignalChildrenOfEach(params: {
	query: Core.Query<Config>
	parents: readonly Scl.Ref<Scl.ElementsOf>[]
}): Promise<Core.AnyRawRecord[][]> {
	const { query, parents } = params
	const refs = [
		...new Map(
			parents.flatMap((parent) => (parent.id ? [[parent.id, parent] as const] : [])),
		).values(),
	]
	const read = refs.length > 0 ? await query.getRecords(refs) : []
	const parentById = new Map(
		read.flatMap((parent) => (parent ? [[parent.id, parent] as const] : [])),
	)

	const signalsByTag = await Promise.all(
		[...SIGNAL_TAG_NAMES].map(function readSignalsOfTag(tagName) {
			return readChildrenOfTag({ query, parents: [...parentById.values()], tagName })
		}),
	)
	const signalById = new Map(signalsByTag.flatMap((signals) => [...signals]))

	return parents.map((ref) => {
		const parent = ref.id ? parentById.get(ref.id) : undefined
		if (!parent) return []
		return parent.children.flatMap((link) => {
			const signal = SIGNAL_TAG_NAMES.has(link.tagName) ? signalById.get(link.id) : undefined
			return signal ? [signal] : []
		})
	})
}

/**
 * The siblings of each signal (SourceRef, ControlRef): the signals among its parent's children, of either tag, the
 * signal included, in the order of the parent's children. A record with no parent, or whose parent names no element
 * or holds no signal, answers itself alone. Signals of one parent share one list.
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
		parents: placed.map((record) => record.parent as Scl.Ref<Scl.ElementsOf>),
	})
	const siblingsById = new Map(placed.map((record, index) => [record.id, children[index]]))
	return records.map((record) => {
		const siblings = siblingsById.get(record.id)
		return siblings && siblings.length > 0 ? siblings : [record]
	})
}

/**
 * The children of `tagName` of the parents holding one directly, by id; only those parents are asked, so
 * `getChildrenOfEach` never reads a parent's transparent wrappers.
 */
async function readChildrenOfTag(params: {
	query: Core.Query<Config>
	parents: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	tagName: string
}): Promise<Map<string, Core.AnyRawRecord>> {
	const { query, tagName } = params
	const parents = params.parents.filter((parent) =>
		parent.children.some((child) => child.tagName === tagName),
	)
	if (parents.length === 0) return new Map()
	const children = await query.getChildrenOfEach(parents, {
		tagName: tagName as Scl.ChildrenOf<Scl.ElementsOf>,
	})
	return new Map(
		children.flat().map((child) => [child.id, toRawRecord(child) as Core.AnyRawRecord] as const),
	)
}
