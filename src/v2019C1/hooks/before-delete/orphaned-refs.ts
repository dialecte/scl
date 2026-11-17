import { CASCADE_PERF_SPAN, DATA_SET_ENTRY_TAG, DATA_SET_TAG } from './orphaned-refs.constants'
import { tupleOrphanOf, tupleReferrerTagsReached } from './tuple-orphans'

import { toRawRecord, widen } from '@dialecte/core/helpers'

import { KEEP_ON_ORPHAN_REFS, REFERENCE_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'
import { isEmptiedContainer } from '@/v2019C1/helpers/pruned-when-empty'
import { PRUNED_WHEN_EMPTY_TAGS } from '@/v2019C1/helpers/pruned-when-empty.constants'
import { confRevRaisesOf, dataSetRemovalsOf } from '@/v2019C1/hooks/shared/data-set-entry'
import { DATA_SET_SENDER_TAGS } from '@/v2019C1/hooks/shared/data-set-entry.constants'
import { updatedOperation, withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'

import type { DeleteCascade, DeletedSubtree, OrphanedRef, RefPairs } from './orphaned-refs.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

// ── Orphaned refs cleanup ─────────────────────────────────────────────────────

/**
 * Stage what deleting a subtree does to what refers to it ({@link collectDeleteCascade}): a reference keeping its
 * content has its uuid, path and companion attributes cleared; any other is deleted. Each parent losing children is
 * updated once. The record itself is deleted by the caller; a container left holding nothing goes at the commit.
 */
export async function cleanOrphanedRefs<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params
	query.perf.start(CASCADE_PERF_SPAN)
	try {
		// a container a deleted reference empties is judged at the commit: the transaction may fill it again before
		const cascade = await collectDeleteCascade(query, {
			roots: [widen(record)],
			emptiesContainers: false,
		})
		// a data set deleted itself is deleted by the store: what it leaves its control blocks still counts
		return await buildCascadeOperations(query, {
			cascade,
			deletedRoots: [],
			deletedElsewhere: record.tagName === DATA_SET_TAG ? [widen(record)] : [],
		})
	} finally {
		query.perf.stop(CASCADE_PERF_SPAN)
	}
}

/**
 * What deleting the roots does beyond their subtrees, read only: the references outside naming one of their elements
 * (`findOrphanedRefs`), deleted or cleared; with `emptiesContainers`, the containers a deleted reference leaves holding
 * nothing that have no reason to stay ({@link collectEmptiedAbove}); then what refers to what was deleted, in turn.
 * A deleted reference takes what it holds with it (`within`, read level by level, {@link readSubtreeRecords}); only
 * what a delete takes by itself is in `deleted`. The delete hook stages it, the commit pass stages it for the
 * containers it removes, a report lists it.
 */
export async function collectDeleteCascade(
	query: Core.Query<Config>,
	params: {
		roots: readonly Scl.RawRecord<Scl.ElementsOf>[]
		/** The containers a deleted reference leaves holding nothing go too, with what refers to them. */
		emptiesContainers: boolean
		/** Containers never judged empty (the commit's other operations give them a child). */
		kept?: ReadonlySet<string>
	},
): Promise<DeleteCascade> {
	const { emptiesContainers, kept } = params
	const rootSubtree = await readSubtreeRecords(query, { records: params.roots })
	const gone = new Set(rootSubtree.map((record) => record.id))

	const deleted = new Map<string, Scl.TrackedRecord<Scl.ElementsOf>>()
	const within = new Map<string, Scl.RawRecord<Scl.ElementsOf>>()
	// a container pruned takes what it still holds (an `Authentication`, a `Private`): the store deletes by id only
	if (emptiesContainers) {
		const rootIds = new Set(params.roots.map((root) => root.id))
		for (const record of rootSubtree) if (!rootIds.has(record.id)) within.set(record.id, record)
	}
	const cleared = new Map<string, OrphanedRef>()
	let roundSubtree: readonly Scl.RawRecord<Scl.ElementsOf>[] = rootSubtree
	while (roundSubtree.length > 0) {
		// what goes in this round is named by references in turn: a relation a deleted equipment took has its own
		const references: Scl.TrackedRecord<Scl.ElementsOf>[] = []
		const containers: Scl.TrackedRecord<Scl.ElementsOf>[] = []
		for (const orphaned of await findOrphanedRefsInSubtrees({ subtree: roundSubtree, query })) {
			const { id } = orphaned.record
			if (gone.has(id)) continue
			if (orphaned.effect === 'cleared') {
				mergeCleared({ cleared, orphaned })
				continue
			}
			gone.add(id)
			deleted.set(id, orphaned.record)
			references.push(orphaned.record)
			if (emptiesContainers) {
				const emptied = await collectEmptiedAbove(query, { record: orphaned.record, gone, kept })
				for (const container of emptied) deleted.set(container.id, container)
				containers.push(...emptied)
			}
		}
		// each deleted reference takes what it holds, so those records go too and are not listed on their own
		const referenceSubtree = await readSubtreeRecords(query, { records: references })
		const insideAnother = recordsInsideAnother(referenceSubtree)
		for (const record of insideAnother) {
			gone.add(record.id)
			within.set(record.id, record)
		}
		// a container emptied takes what it still holds, nothing else naming it (an `Authentication`, a `Private`)
		const leftovers = (await readSubtreeRecords(query, { records: containers })).filter(
			(record) => !gone.has(record.id) && !deleted.has(record.id),
		)
		for (const record of leftovers) {
			gone.add(record.id)
			within.set(record.id, record)
		}
		roundSubtree = [...referenceSubtree, ...containers, ...leftovers]
	}
	for (const id of within.keys()) deleted.delete(id)
	const stillThere = [...cleared.values()].filter((orphaned) => !gone.has(orphaned.record.id))
	return {
		gone,
		deleted: [...deleted.values()],
		within: [...within.values()],
		cleared: stillThere,
	}
}

/**
 * The containers above a record that are left emptied once everything in `gone` is gone (`isEmptiedContainer`: holding
 * nothing else, or none of the children of a kind they require), walked up; each is added to `gone`. One already in
 * `gone` is not walked through.
 */
export async function collectEmptiedAbove(
	query: Core.Query<Config>,
	params: {
		record: Scl.RawRecord<Scl.ElementsOf>
		gone: Set<string>
		/** Containers the walk stops at, whatever they hold. */
		kept?: ReadonlySet<string>
	},
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { gone, kept } = params
	const emptied: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	let parentRef = params.record.parent
	while (parentRef && PRUNED_WHEN_EMPTY_TAGS.has(parentRef.tagName) && !gone.has(parentRef.id)) {
		if (kept?.has(parentRef.id)) break
		const parent: Scl.TrackedRecord<Scl.ElementsOf> | undefined = await query.getRecord(parentRef)
		if (!parent || !isEmptiedContainer({ record: parent, gone })) break
		gone.add(parent.id)
		emptied.push(parent)
		parentRef = parent.parent
	}
	return emptied
}

/**
 * The operations of a cascade: each reference cleared, each record deleted (the roots given in `deletedRoots` too, and
 * what the deleted references hold), and one update per parent that stays and loses children.
 */
export async function buildCascadeOperations(
	query: Core.Query<Config>,
	params: {
		cascade: DeleteCascade
		deletedRoots: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
		/** Records other operations of the same commit write, read instead of the staged state. */
		pending?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
		/** Control blocks whose revision the transaction raised already: a data set change raises it once. */
		raised?: ReadonlySet<string>
		/** Data sets the store deletes itself (the delete hook's own record): their control blocks lose them, no delete staged. */
		deletedElsewhere?: readonly Scl.RawRecord<Scl.ElementsOf>[]
	},
): Promise<Scl.Operation[]> {
	const { cascade, deletedRoots, pending, raised, deletedElsewhere = [] } = params
	const operations: Scl.Operation[] = []
	for (const orphaned of cascade.cleared) {
		// a reference the same commit writes is cleared from what it writes
		const record = pending?.get(orphaned.record.id) ?? toRawRecord(orphaned.record)
		operations.push(buildClearedAttributesOp({ record, attributes: orphaned.attributes }))
	}
	const deleted = [...deletedRoots, ...cascade.deleted]
	for (const deletedRecord of [...deleted, ...cascade.within]) {
		operations.push({
			status: 'deleted',
			oldRecord: toRawRecord(deletedRecord),
			newRecord: undefined,
		})
	}
	const parentUpdates = await buildParentUpdates(query, { deleted, gone: cascade.gone, pending })
	// a control block losing a child and raising its revision is one update: the raise reads the parent update
	const staged = new Map(pending)
	for (const update of parentUpdates) {
		if (update.status === 'updated') staged.set(update.newRecord.id, update.newRecord)
	}
	const confRevRaises = await buildConfRevRaises(query, {
		deleted: [...deletedElsewhere, ...deleted],
		gone: cascade.gone,
		pending: staged,
		raised,
	})
	operations.push(...mergeUpdates({ first: parentUpdates, last: confRevRaises }))
	return operations
}

/**
 * Two lists of updates as one: an update of `last` to a record `first` also updates replaces it, keeping the record
 * as `first` read it.
 */
function mergeUpdates(params: {
	first: readonly Scl.Operation[]
	last: readonly Scl.Operation[]
}): Scl.Operation[] {
	const { first, last } = params
	const later = new Map(
		last.flatMap((operation): [string, Scl.Operation][] =>
			operation.status === 'updated' ? [[operation.newRecord.id, operation]] : [],
		),
	)
	const merged = first.map((operation): Scl.Operation => {
		const replacing = operation.status === 'updated' ? later.get(operation.newRecord.id) : undefined
		if (!replacing || replacing.status !== 'updated' || operation.status !== 'updated')
			return operation
		later.delete(operation.newRecord.id)
		return { status: 'updated', oldRecord: operation.oldRecord, newRecord: replacing.newRecord }
	})
	return [...merged, ...later.values()]
}

/**
 * One update per control block whose data set changes: one sending a data set that stays and loses entries (`FCDA`)
 * gets its configuration revision one up ({@link confRevRaisesOf}); one sending a data set that goes (its last entry
 * gone, or deleted itself) loses its `datSet` too ({@link dataSetRemovalsOf}). The data sets, their logical nodes and
 * those nodes' control blocks are read a level at a time, only when an entry or a data set goes.
 */
async function buildConfRevRaises(
	query: Core.Query<Config>,
	params: {
		deleted: readonly Scl.RawRecord<Scl.ElementsOf>[]
		gone: ReadonlySet<string>
		pending?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
		raised?: ReadonlySet<string>
	},
): Promise<Scl.Operation[]> {
	const { deleted, gone, pending, raised = new Set<string>() } = params
	const dataSetRefs = deleted.flatMap((record) =>
		record.tagName === DATA_SET_ENTRY_TAG && record.parent && !gone.has(record.parent.id)
			? [record.parent as Scl.Ref<Scl.ElementsOf>]
			: [],
	)
	const dataSets = await readStaying(query, { refs: dataSetRefs, pending })
	const removedDataSets = deleted.filter(
		(record) => record.tagName === DATA_SET_TAG && record.parent && !gone.has(record.parent.id),
	)
	const nodes = await readStaying(query, {
		refs: [...dataSets, ...removedDataSets].flatMap((dataSet) =>
			dataSet.parent && !gone.has(dataSet.parent.id)
				? [dataSet.parent as Scl.Ref<Scl.ElementsOf>]
				: [],
		),
		pending,
	})
	const blocks = await readStaying(query, {
		refs: nodes.flatMap(
			(node) =>
				node.children.filter(
					(child) => DATA_SET_SENDER_TAGS.has(child.tagName) && !gone.has(child.id),
				) as Scl.Ref<Scl.ElementsOf>[],
		),
		pending,
	})
	function blocksOf(dataSet: Scl.RawRecord<Scl.ElementsOf>): AnyRawRecord[] {
		return blocks.filter((block) => block.parent?.id === dataSet.parent?.id) as AnyRawRecord[]
	}
	const raises = dataSets.flatMap((dataSet) =>
		confRevRaisesOf({
			dataSetName: readAttribute({ record: dataSet, name: 'name', defaults: 'none' }),
			blocks: blocksOf(dataSet),
		})
			.filter(({ block }) => !raised.has(block.id))
			.map(({ block, confRev }) => controlBlockUpdate({ block, confRev, datSetRemoved: false })),
	)
	const removals = removedDataSets.flatMap((dataSet) =>
		dataSetRemovalsOf({
			dataSetName: readAttribute({ record: dataSet, name: 'name', defaults: 'none' }),
			blocks: blocksOf(dataSet),
		}).map(({ block, confRev }) =>
			controlBlockUpdate({
				block,
				confRev: raised.has(block.id) ? undefined : confRev,
				datSetRemoved: true,
			}),
		),
	)
	return [...raises, ...removals]
}

/** The update of a control block whose data set changed: its revision raised, its `datSet` removed with its data set. */
function controlBlockUpdate(params: {
	block: AnyRawRecord
	confRev: string | undefined
	datSetRemoved: boolean
}): Scl.Operation {
	const { block, confRev, datSetRemoved } = params
	const record = block as Scl.RawRecord<Scl.ElementsOf>
	return updatedOperation(
		record,
		withAttributeValues(record.attributes, [
			...(confRev === undefined ? [] : [{ name: 'confRev', value: confRev }]),
			...(datSetRemoved ? [{ name: 'datSet', value: undefined }] : []),
		]),
	)
}

/** The records of `refs`, each once, read in one batch; one the commit's other operations write taken from `pending`. */
async function readStaying(
	query: Core.Query<Config>,
	params: {
		refs: readonly Scl.Ref<Scl.ElementsOf>[]
		pending?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	},
): Promise<Scl.RawRecord<Scl.ElementsOf>[]> {
	const { pending } = params
	const unique = [
		...new Map(params.refs.flatMap((ref) => (ref.id ? [[ref.id, ref] as const] : []))).values(),
	]
	const toRead = unique.filter((ref) => !pending?.has(ref.id ?? ''))
	const read = toRead.length > 0 ? await query.getRecords<Scl.ElementsOf>(toRead) : []
	return [
		...unique.flatMap((ref) => {
			const written = pending?.get(ref.id ?? '')
			return written ? [written] : []
		}),
		...read.flatMap((record) => (record ? [toRawRecord(record)] : [])),
	]
}

/** The record ids of the subtrees of `records`, their wrappers included. */
export async function collectSubtreeIds(
	query: Core.Query<Config>,
	params: { records: readonly Scl.RawRecord<Scl.ElementsOf>[] },
): Promise<Set<string>> {
	const subtree = await readSubtreeRecords(query, { records: params.records })
	return new Set(subtree.map((record) => record.id))
}

/**
 * Every record of the subtrees of `records`, the roots first then level by level: it follows `children` whatever the
 * tag (a foreign element, a `Private`'s content), reading one level in one batched `query.getRecords`. A record with
 * no child costs no read; a child id that is no record is skipped; a record reached twice is returned once.
 */
export async function readSubtreeRecords(
	query: Core.Query<Config>,
	params: { records: readonly Scl.RawRecord<Scl.ElementsOf>[] },
): Promise<Scl.RawRecord<Scl.ElementsOf>[]> {
	const seen = new Set<string>()
	const subtree: Scl.RawRecord<Scl.ElementsOf>[] = []
	let level: Scl.RawRecord<Scl.ElementsOf>[] = []
	for (const record of params.records) {
		if (seen.has(record.id)) continue
		seen.add(record.id)
		level.push(record)
	}
	while (level.length > 0) {
		subtree.push(...level)
		const childRefs: Scl.Ref<Scl.ElementsOf>[] = []
		for (const record of level) {
			for (const childRef of record.children) {
				if (seen.has(childRef.id)) continue
				seen.add(childRef.id)
				childRefs.push(childRef as Scl.Ref<Scl.ElementsOf>)
			}
		}
		if (childRefs.length === 0) break
		const children = await query.getRecords<Scl.ElementsOf>(childRefs)
		level = children.filter((child) => child !== undefined)
	}
	return subtree
}

/**
 * The records of some read subtrees that sit inside another record of them: their parent is in the subtrees too, so
 * the roots left out, except one that lies inside another root.
 */
function recordsInsideAnother(
	subtree: readonly Scl.RawRecord<Scl.ElementsOf>[],
): Scl.RawRecord<Scl.ElementsOf>[] {
	const ids = new Set(subtree.map((record) => record.id))
	return subtree.filter((record) => record.parent !== null && ids.has(record.parent.id))
}

/** Record a reference cleared, the attributes of each removal naming it together. */
function mergeCleared(params: { cleared: Map<string, OrphanedRef>; orphaned: OrphanedRef }): void {
	const { cleared, orphaned } = params
	const known = cleared.get(orphaned.record.id)
	const attributes = new Set([...(known?.attributes ?? []), ...orphaned.attributes])
	cleared.set(orphaned.record.id, { ...orphaned, attributes })
}

/** One update per parent that stays and loses children: its children list without them. */
async function buildParentUpdates(
	query: Core.Query<Config>,
	params: {
		deleted: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
		gone: ReadonlySet<string>
		pending?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
	},
): Promise<Scl.Operation[]> {
	const { deleted, gone, pending } = params
	const parentIds = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const deletedRecord of deleted) {
		const { parent } = deletedRecord
		if (parent && !gone.has(parent.id)) parentIds.set(parent.id, parent as Scl.Ref<Scl.ElementsOf>)
	}
	const operations: Scl.Operation[] = []
	for (const [parentId, parentRef] of parentIds) {
		const parentRecord = pending?.get(parentId) ?? (await query.getRecord(parentRef))
		if (!parentRecord) continue
		const children = parentRecord.children.filter((child) => !gone.has(child.id))
		operations.push({
			status: 'updated',
			oldRecord: toRawRecord(parentRecord),
			newRecord: toRawRecord({ ...parentRecord, children }),
		})
	}
	return operations
}

/**
 * The references outside some subtrees that name an element of them, each with what their deletion does to them:
 * `cleared` for a reference keeping its content (`KEEP_ON_ORPHAN_REFS`: its uuid, path and companion attributes go),
 * `deleted` for any other. A reference inside the subtrees goes with them. The reference tags are read once.
 */
export async function findOrphanedRefs(params: {
	records: readonly Scl.RawRecord<Scl.ElementsOf>[]
	query: Core.Query<Config>
}): Promise<OrphanedRef[]> {
	const { records, query } = params
	const subtree = await readSubtreeRecords(query, { records })
	return findOrphanedRefsInSubtrees({ subtree, query })
}

/** {@link findOrphanedRefs} over subtrees already read. */
async function findOrphanedRefsInSubtrees(params: {
	subtree: readonly Scl.RawRecord<Scl.ElementsOf>[]
	query: Core.Query<Config>
}): Promise<OrphanedRef[]> {
	const { subtree, query } = params

	const subtreeIds = new Set<string>()
	const subtreeUuids = new Set<string>()
	const byUuid = new Map<string, Scl.RawRecord<Scl.ElementsOf>>()
	const iedNames = new Set<string>()
	for (const record of subtree) {
		subtreeIds.add(record.id)
		const uuid = readAttribute({ record, name: 'uuid' })
		if (uuid) {
			subtreeUuids.add(uuid)
			byUuid.set(uuid, record)
		}
		if (record.tagName === 'IED')
			iedNames.add(readAttribute({ record, name: 'name', defaults: 'none' }))
	}
	if (subtreeUuids.size === 0) return []
	const deleted: DeletedSubtree = {
		ids: subtreeIds,
		byId: new Map(subtree.map((record) => [record.id, record])),
		byUuid,
		iedNames,
		uuidTags: new Set([...byUuid.values()].map((record) => record.tagName)),
	}

	const orphaned: OrphanedRef[] = []
	for (const refTagName of REFERENCE_TAGS) {
		const refPairs = UUID_REFERENCE_PAIRS[refTagName]
		for (const refRecord of await query.getRecordsByTagName(refTagName)) {
			if (subtreeIds.has(refRecord.id)) continue
			const attributes = collectOrphanedAttributes({ refPairs, refRecord, subtreeUuids })
			if (attributes.size === 0) continue
			const effect = KEEP_ON_ORPHAN_REFS.has(refTagName) ? 'cleared' : 'deleted'
			orphaned.push({ record: refRecord, effect, attributes })
		}
	}
	const tupleReferrers = await Promise.all(
		tupleReferrerTagsReached({ subtree: deleted }).map(function readReferrers(refTagName) {
			// dialecte-allow query-in-loop: one read per tuple referrer tag that can name what the delete removes (eleven at most): core reads one tag per call
			return query.getRecordsByTagName(refTagName)
		}),
	)
	for (const refRecord of tupleReferrers.flat()) {
		if (subtreeIds.has(refRecord.id)) continue
		const tupleOrphan = tupleOrphanOf({ refRecord, subtree: deleted })
		if (tupleOrphan) orphaned.push(tupleOrphan)
	}
	return orphaned
}

// ── Attribute collection ──────────────────────────────────────────────────────

function collectOrphanedAttributes(params: {
	refPairs: RefPairs
	refRecord: Scl.TrackedRecord<Scl.ElementsOf>
	subtreeUuids: Set<string>
}): Set<string> {
	const { refPairs, refRecord, subtreeUuids } = params
	const attributesToClear = new Set<string>()

	for (const pair of refPairs) {
		const uuidValue = readAttribute({
			record: refRecord,
			name: pair.attribute.uuid,
			defaults: 'none',
		})
		if (!uuidValue || !subtreeUuids.has(uuidValue)) continue

		attributesToClear.add(pair.attribute.uuid)
		attributesToClear.add(pair.attribute.path)
		for (const companion of pair.companions) {
			attributesToClear.add(companion.name)
		}
	}

	return attributesToClear
}

// ── Operation builders ────────────────────────────────────────────────────────

function buildClearedAttributesOp(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	attributes: ReadonlySet<string>
}): Scl.Operation {
	const { record: refRecord, attributes: attributesToClear } = params
	const updatedAttributes = refRecord.attributes.filter(
		(attribute) => !attributesToClear.has(attribute.name),
	)
	return {
		status: 'updated',
		oldRecord: toRawRecord(refRecord),
		newRecord: toRawRecord({ ...refRecord, attributes: updatedAttributes }),
	}
}
