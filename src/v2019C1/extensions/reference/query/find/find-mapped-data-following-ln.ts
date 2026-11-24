import { findNativeLnByPath } from '../resolve/find-native-ln-by-path'
import { findNativeLnByUuid } from '../resolve/find-native-ln-by-uuid'
import { resolveMappedDataFrom } from '../resolve/resolve-mapped-data-from'
import { resolveMappedLNodes } from '../resolve/resolve-mapped-lnodes'
import {
	DATA_PARENT_TAGS,
	LNODE_TAGS,
	SUBTREE_COLLECT,
} from './find-mapped-data-following-ln.constants'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { readAttributes } from '@/v2019C1/helpers'

import type { NativeLogicalNode } from '../resolve/find-native-ln.types'
import type { MappedDataSource } from '../resolve/resolve-mapped-data-from.types'
import type {
	DataRef,
	DataUnderRoot,
	RootRecord,
	LnRef,
	RecordSourceParams,
	RecordsRead,
} from './find-mapped-data-following-ln.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The `DOS` / `SDS` / `DAS` that a logical node implements by default: they name nothing
 * themselves and follow it, through the `LNode` mapped to it or through a parent data whose
 * own pair names it. Records that name the logical node themselves carry its uuid and are
 * not repeated here.
 *
 * Perf: the data and `Private` under the roots (the LNodes mapped to it, the data naming it) in one
 * `findDescendantsOfEach`, the roots' ancestors in one `findAncestorsOfEach`; the rules answer from those records, a uuid or a path named
 * looked up once per call.
 */
export async function findMappedDataFollowingLn(
	query: Core.Query<Config>,
	params: { ln: Scl.TrackedRecord<'LN' | 'LN0'> },
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { ln } = params
	const { uuid } = await query.getAttributes(ln)
	if (!uuid) return []

	const lnodes = await query.getRecordsByTagName('LNode')
	const mappedLNodes = await resolveMappedLNodes(query, { lnodes })
	const dataNamingLn = await findDataNamingLn(query, { uuid })
	const roots: RootRecord[] = [
		...lnodes.filter(function isMappedToLn(lnode) {
			return mappedLNodes.get(lnode.id)?.ln.id === ln.id
		}),
		...dataNamingLn,
	]
	if (roots.length === 0) return []

	const descendants = await query.findDescendantsOfEach(roots, { collect: [...SUBTREE_COLLECT] })
	// the answer typed per root tag is not comparable to a record of any tag; the batch verbs take the narrow roots,
	// which keeps their type cost low
	const subtrees = descendants as unknown as DataUnderRoot[]
	// no data under any root: nothing can follow the logical node, and no ancestor is read
	if (!subtrees.some(holdsData)) return []
	// the chains are followed by `record.parent`: a root's Private stays in them
	const ancestries = await query.findAncestorsOfEach(roots, { unwrap: [] })
	const records = await readRecords({ query, roots, subtrees, ancestries })
	const source = createRecordSource({ query, records, mappedLNodes })

	const found = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
	for (const descendants of subtrees) {
		for (const tagName of MAPPED_NAME_REFS.keys()) {
			for (const record of descendants[tagName] ?? []) {
				if (found.has(record.id)) continue
				const node = { tagName: record.tagName, id: record.id } as DataRef
				const { mappedData } = await resolveMappedDataFrom(source, { node })
				if (mappedData?.origin === 'default' && mappedData.ln.id === ln.id) {
					found.set(record.id, record)
				}
			}
		}
	}
	return [...found.values()]
}

/** Whether a root's subtree holds a `DOS`, `SDS` or `DAS`. */
function holdsData(descendants: DataUnderRoot): boolean {
	return [...MAPPED_NAME_REFS.keys()].some(function isHeld(tagName) {
		return (descendants[tagName]?.length ?? 0) > 0
	})
}

/** `DOS` / `SDS` whose own pair names the logical node: their children may follow it. */
async function findDataNamingLn(
	query: Core.Query<Config>,
	params: { uuid: string },
): Promise<(Scl.TrackedRecord<'DOS'> | Scl.TrackedRecord<'SDS'>)[]> {
	const { uuid } = params
	const dos = await query.findByAttributes({ tagName: 'DOS', attributes: { mappedLnUuid: uuid } })
	const sds = await query.findByAttributes({ tagName: 'SDS', attributes: { mappedLnUuid: uuid } })
	return [...dos, ...sds]
}

/**
 * Every record read for the call by id: the roots, their ancestors, the data and `Private` under them. A record
 * whose parents climb to one not read (an element between the data and its root that is not collected) has its
 * ancestors read too, all such records in one walk: each record climbs to the document root through records read.
 */
async function readRecords(params: {
	query: Core.Query<Config>
	roots: readonly RootRecord[]
	subtrees: readonly DataUnderRoot[]
	ancestries: readonly (readonly Scl.TrackedRecord<Scl.ElementsOf>[])[]
}): Promise<RecordsRead> {
	const { query, roots, subtrees, ancestries } = params
	const collected = subtrees.flatMap(function recordsUnder(descendants) {
		return Object.values(descendants).flat()
	})
	// a record of one root tag is not comparable to a record of any tag (see the subtrees above)
	const rootRecords = roots as unknown as readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	const records = indexById([...rootRecords, ...ancestries.flat(), ...collected])

	const unclimbed = collected.filter(function isUnclimbed(record) {
		return record !== undefined && climbsOut({ records, record })
	})
	if (unclimbed.length === 0) return records
	const filled = await query.findAncestorsOfEach(unclimbed as Scl.TrackedRecord<Scl.ElementsOf>[], {
		unwrap: [],
	})
	return indexById([...records.values(), ...filled.flat()])
}

/** The records by id, the first of an id kept. */
function indexById(list: readonly (Scl.TrackedRecord<Scl.ElementsOf> | undefined)[]): RecordsRead {
	const kept = list.filter(function isRecord(record): record is Scl.TrackedRecord<Scl.ElementsOf> {
		return record !== undefined
	})
	return new Map(
		[...kept].reverse().map(function byId(record) {
			return [record.id, record] as const
		}),
	)
}

/** Whether the record's parents reach one not read before the document root. */
function climbsOut(params: {
	records: RecordsRead
	record: Scl.TrackedRecord<Scl.ElementsOf>
}): boolean {
	const { records } = params
	let parent = params.record.parent
	for (let steps = 0; parent && steps <= records.size; steps++) {
		const read = records.get(parent.id)
		if (!read) return true
		parent = read.parent
	}
	return false
}

/** The nearest ancestor of one of the tags, climbing the parents read; a parent cycle (corrupt store) ends the climb. */
function findNearestRead(params: {
	records: RecordsRead
	record: Scl.TrackedRecord<Scl.ElementsOf> | undefined
	tagNames: ReadonlySet<string>
}): Scl.TrackedRecord<Scl.ElementsOf> | undefined {
	const { records, tagNames } = params
	let current = params.record?.parent ? records.get(params.record.parent.id) : undefined
	for (let steps = 0; current && steps < records.size; steps++) {
		if (tagNames.has(current.tagName)) return current
		current = current.parent ? records.get(current.parent.id) : undefined
	}
	return undefined
}

/**
 * The mapped-data rules' source over the records read: a data's attributes and nearest parent data, the LNode above
 * it, as `resolveMappedDataAndDefault` reads them from the store; the logical nodes named by uuid or path looked up
 * once per call.
 */
function createRecordSource(params: RecordSourceParams): MappedDataSource<DataRef, LnRef> {
	const { query, records, mappedLNodes } = params
	const lnByUuid = new Map<string, Promise<LnRef | undefined>>()
	const lnByPath = new Map<string, Promise<LnRef | undefined>>()

	return {
		async readNode(reference) {
			const attributeNames = MAPPED_NAME_REFS.get(reference.tagName)
			const record = records.get(reference.id)
			if (!attributeNames || !record) return undefined
			const attributes: Record<string, string | undefined> = readAttributes({ record })
			const parent = findNearestRead({ records, record, tagNames: DATA_PARENT_TAGS })
			return {
				name: attributes.name,
				ix: attributes.ix,
				mappedName: attributes[attributeNames.path],
				mappedLnUuid: attributes[attributeNames.uuid],
				parent: parent && ({ tagName: parent.tagName, id: parent.id } as DataRef),
			}
		},
		async findLNodeLn(reference) {
			const record = records.get(reference.id)
			const lnode = findNearestRead({ records, record, tagNames: LNODE_TAGS })
			return lnode && mappedLNodes.get(lnode.id)?.ln
		},
		findLnByUuid(uuid) {
			const answer = lnByUuid.get(uuid) ?? findNativeLnByUuid(query, { uuid }).then(toLnRef)
			lnByUuid.set(uuid, answer)
			return answer
		},
		findLnByPath(path) {
			const answer = lnByPath.get(path) ?? findNativeLnByPath(query, { path }).then(toLnRef)
			lnByPath.set(path, answer)
			return answer
		},
	}
}

/** The ref of a logical node found. */
function toLnRef(found: NativeLogicalNode | undefined): LnRef | undefined {
	return found && { tagName: found.ln.tagName, id: found.ln.id }
}
