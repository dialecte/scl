import { TRANSPARENT_TAGS } from './collect-with-ancestry.constants'
import { noAncestry, toAnyRawRecord } from './collect-with-ancestry.helpers'

import { orderByConfigSequence } from '@dialecte/core/utils'

import { CHILDREN, DESCENDANTS, ROOT_ELEMENT } from '@/v2019C1/definition/constants.generated'

import type {
	CollectedWithAncestry,
	CollectSelect,
	SelectedChild,
	SelectState,
	TagCollectingQuery,
} from './collect-with-ancestry.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTrackedRecord } from '@dialecte/core'

/**
 * Reads the part of the document a select names with one flat `findDescendants` over its tags, and
 * lays it flat: the walk from the document root over each record's `children`, transparent wrappers
 * unwrapped and siblings put in the sequence the dialecte declares, gives the elements in document
 * order and each the path it was reached by, so the ancestry of an element is never a query. The
 * store is read once per tag and nothing of the other tags is read: what a section of a document
 * that holds a lot of other elements needs.
 */
export async function collectFromTags(
	query: Core.Query<Config>,
	params: { select: CollectSelect },
): Promise<CollectedWithAncestry> {
	const { select } = params
	const root: Scl.Ref<typeof ROOT_ELEMENT> = { tagName: ROOT_ELEMENT }
	const rootRecord = await query.getRecord(root)
	if (!rootRecord) return { records: [], ancestryOf: noAncestry }

	const collected = await (query as unknown as TagCollectingQuery).findDescendants(root, {
		collect: tagsToCollect(select),
	})
	const recordsById = new Map<string, AnyTrackedRecord>()
	for (const group of Object.values(collected)) {
		for (const record of group) recordsById.set(record.id, record)
	}

	const rootRaw = toAnyRawRecord(rootRecord)
	const records: AnyRawRecord[] = [rootRaw]
	const ancestryById = new Map<string, readonly AnyRawRecord[]>([[rootRaw.id, []]])
	walkChildren({
		record: rootRaw,
		state: { select, recursive: true },
		ancestry: [rootRaw],
		recordsById,
		records,
		ancestryById,
	})

	function ancestryOf(id: string): readonly AnyRawRecord[] {
		return ancestryById.get(id) ?? []
	}

	return { records, ancestryOf }
}

/**
 * The tags to read: those the select names (with everything below a `true` entry) and the
 * transparent ones, which the chains of parents go through.
 */
function tagsToCollect(select: CollectSelect): string[] {
	const tags = new Set<string>(TRANSPARENT_TAGS)
	addSelectedTags({ select, tags })
	return [...tags]
}

function addSelectedTags(params: { select: CollectSelect; tags: Set<string> }): void {
	const { select, tags } = params
	for (const [tagName, entry] of Object.entries(select)) {
		if (entry === false) continue
		tags.add(tagName)
		if (entry === true) {
			for (const descendant of tagsBelow(tagName)) tags.add(descendant)
		} else {
			addSelectedTags({ select: entry, tags })
		}
	}
}

/** Every tag an element of the tag may hold, at any depth; none for a tag the dialecte lacks. */
function tagsBelow(tagName: string): readonly string[] {
	const descendants: Readonly<Record<string, readonly string[] | undefined>> = DESCENDANTS
	return descendants[tagName] ?? []
}

/** Whether an element of the tag may hold an element of its own tag. */
function holdsItself(tagName: string): boolean {
	const children: Readonly<Record<string, readonly string[] | undefined>> = CHILDREN
	return children[tagName]?.includes(tagName) ?? false
}

/**
 * What a child of `record` is read with, or `undefined` when it is left out. A tag the select does
 * not name is left out, unless it is transparent or is the tag of its parent, which may hold itself:
 * those are read as the select reads their parent (an explicit entry for the parent's own tag turns
 * this off below it).
 */
function stateOfChild(params: {
	record: AnyRawRecord
	state: SelectState
	tagName: string
}): SelectState | undefined {
	const { record, state, tagName } = params
	const { select, recursive } = state
	if (!select) return state
	const entry = select[tagName]
	if (entry === undefined) {
		if (TRANSPARENT_TAGS.has(tagName)) return state
		return recursive && tagName === record.tagName && holdsItself(tagName) ? state : undefined
	}
	if (entry === false) return undefined
	if (entry === true) return { select: undefined, recursive: true }
	return { select: entry, recursive: tagName !== record.tagName }
}

/**
 * The children of a record that were read and the select keeps, a transparent child replaced by
 * its own children where it stands, in the order of the sequence the dialecte declares for the
 * record's tag (siblings of a tag in the order they are stored).
 */
function selectedChildren(params: {
	record: AnyRawRecord
	state: SelectState
	recordsById: ReadonlyMap<string, AnyTrackedRecord>
}): SelectedChild[] {
	const { record, state, recordsById } = params
	const children: SelectedChild[] = []
	for (const childRef of record.children) {
		const tracked = recordsById.get(childRef.id)
		if (!tracked) continue
		const childState = stateOfChild({ record, state, tagName: tracked.tagName })
		if (!childState) continue
		const child = toAnyRawRecord(tracked)
		if (TRANSPARENT_TAGS.has(child.tagName)) {
			children.push(...selectedChildren({ record: child, state: childState, recordsById }))
		} else {
			children.push({ record: child, tagName: child.tagName, state: childState })
		}
	}
	return orderByConfigSequence({
		parentTagName: record.tagName,
		children,
		childrenConfig: CHILDREN,
	})
}

/** Puts what is read below a record in `records`, each element before its own children. */
function walkChildren(params: {
	record: AnyRawRecord
	state: SelectState
	ancestry: readonly AnyRawRecord[]
	recordsById: ReadonlyMap<string, AnyTrackedRecord>
	records: AnyRawRecord[]
	ancestryById: Map<string, readonly AnyRawRecord[]>
}): void {
	const { record, state, ancestry, recordsById, records, ancestryById } = params
	for (const child of selectedChildren({ record, state, recordsById })) {
		records.push(child.record)
		ancestryById.set(child.record.id, ancestry)
		walkChildren({
			record: child.record,
			state: child.state,
			ancestry: [...ancestry, child.record],
			recordsById,
			records,
			ancestryById,
		})
	}
}
