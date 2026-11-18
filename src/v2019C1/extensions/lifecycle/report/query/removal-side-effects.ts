import { toRawRecord } from '@dialecte/core/helpers'

import {
	collectUnusedTypes,
	createTypeReads,
	lostTypeNames,
} from '@/v2019C1/extensions/data-model/query/unused-types'
import { readAttribute } from '@/v2019C1/helpers'
import {
	lnodesBoundTo,
	readLogicalNodeKeys,
} from '@/v2019C1/hooks/before-commit/release-deleted-logical-nodes'
import { LOGICAL_NODE_TAG_NAMES } from '@/v2019C1/hooks/before-commit/release-deleted-logical-nodes.constants'
import {
	collectDeleteCascade,
	collectEmptiedAbove,
	readSubtreeRecords,
} from '@/v2019C1/hooks/before-delete'
import { DATA_SET_TAG } from '@/v2019C1/hooks/before-delete/orphaned-refs.constants'
import { dataSetRemovalsOf } from '@/v2019C1/hooks/shared/data-set-entry'
import { DATA_SET_SENDER_TAGS } from '@/v2019C1/hooks/shared/data-set-entry.constants'

import type { LNodeReads } from './removal-side-effects.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TypeReads } from '@/v2019C1/extensions/data-model/query/unused-types.types'
import type {
	DecisionGroup,
	DiffNode,
	RemovalSideEffect,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * Write on each group that removes elements what its removal does outside them (`DecisionGroup.sideEffects`), as the
 * delete hooks and the commit read it: the types the removal leaves unused (the removed elements were the last to
 * name them), the containers the removal leaves holding nothing that have no reason to stay, the references elsewhere
 * naming a removed element, deleted or cleared, the containers and references those deletions take in turn, and the
 * LNodes bound to a removed logical node, released (`cleared`) at the commit. What
 * the group removes itself is not listed. A group is judged on its own: a type another group's removal also leaves
 * unused is not listed by either.
 */
export async function listRemovalSideEffects(
	query: Core.Query<Config>,
	params: { groups: readonly DecisionGroup[] },
): Promise<void> {
	// a report writes nothing: the data types are read once for all its groups, the LNodes once when one is needed
	const typeReads = createTypeReads(query)
	const lnodeReads = createLNodeReads(query)
	for (const group of params.groups) {
		const sideEffects = await readSideEffects(query, { group, typeReads, lnodeReads })
		if (sideEffects.length > 0) group.sideEffects = sideEffects
	}
}

async function readSideEffects(
	query: Core.Query<Config>,
	params: { group: DecisionGroup; typeReads: TypeReads; lnodeReads: LNodeReads },
): Promise<RemovalSideEffect[]> {
	const roots: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	for (const node of [params.group.primary, ...params.group.companions]) {
		const { instanceRef } = node
		if (!removes(node) || !instanceRef?.id) continue
		const ref = { tagName: instanceRef.tagName, id: instanceRef.id } as Scl.Ref<Scl.ElementsOf>
		const record = await query.getRecord(ref)
		if (record) roots.push(record)
	}
	if (roots.length === 0) return []
	const subtree = await readSubtreeRecords(query, { records: roots })
	const gone = new Set(subtree.map((record) => record.id))

	// the types the removal leaves unused go at the commit, with the types only they name
	const removed = subtree.map((record) => ({
		status: 'deleted' as const,
		oldRecord: record,
		newRecord: undefined,
	}))
	const unusedTypes = await collectUnusedTypes({
		query,
		names: lostTypeNames(removed),
		gone,
		reads: params.typeReads,
	})

	// the containers the removal leaves holding nothing go at the commit, with what refers to them
	// (a section the pruned types leave empty is among them: the types are gone then too)
	const emptied: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	const goneWithTypes = new Set([...gone, ...unusedTypes.gone])
	// the types of one section share its parent: the walk above them runs once per parent
	const walkedParents = new Set<string>()
	for (const record of [...roots, ...unusedTypes.trees.map((tree) => tree.root)]) {
		if (record.parent && walkedParents.has(record.parent.id)) continue
		if (record.parent) walkedParents.add(record.parent.id)
		const emptiedAbove = await collectEmptiedAbove(query, { record, gone: goneWithTypes })
		emptied.push(...emptiedAbove)
	}
	const cascade = await collectDeleteCascade(query, {
		roots: [...roots, ...emptied],
		emptiesContainers: true,
	})

	const sideEffects: RemovalSideEffect[] = []
	for (const { root } of unusedTypes.trees) {
		sideEffects.push({ element: { tagName: root.tagName, id: root.id }, effect: 'deleted' })
	}
	for (const record of [...emptied, ...cascade.deleted]) {
		sideEffects.push({ element: { tagName: record.tagName, id: record.id }, effect: 'deleted' })
	}
	for (const { record } of cascade.cleared) {
		sideEffects.push({ element: { tagName: record.tagName, id: record.id }, effect: 'cleared' })
	}
	const released = await readReleasedLNodes(query, { subtree, lnodeReads: params.lnodeReads })
	const senders = await readDataSetSenders(query, {
		dataSets: [...subtree, ...emptied, ...cascade.deleted].filter(
			(record) => record.tagName === DATA_SET_TAG,
		),
		gone: new Set([
			...gone,
			...emptied.map((record) => record.id),
			...cascade.deleted.map((record) => record.id),
		]),
	})
	return [...sideEffects, ...released, ...senders]
}

/**
 * The control blocks sending a data set the removal deletes (removed, or left without an entry), outside what goes:
 * each loses its `datSet` at the commit, as `dataSetRemovalsOf` says, `cleared`. The logical nodes holding the data sets
 * and their control blocks read a level at a time.
 */
async function readDataSetSenders(
	query: Core.Query<Config>,
	params: { dataSets: readonly Scl.RawRecord<Scl.ElementsOf>[]; gone: ReadonlySet<string> },
): Promise<RemovalSideEffect[]> {
	const { dataSets, gone } = params
	if (dataSets.length === 0) return []
	const holderRefs = [
		...new Map(
			dataSets.flatMap((dataSet) =>
				dataSet.parent && !gone.has(dataSet.parent.id) ? [[dataSet.parent.id, dataSet.parent]] : [],
			),
		).values(),
	] as Scl.Ref<Scl.ElementsOf>[]
	const holders = (await query.getRecords(holderRefs)).flatMap((record) => (record ? [record] : []))
	const blockRefs = holders.flatMap((holder) =>
		holder.children.filter(
			(child) => DATA_SET_SENDER_TAGS.has(child.tagName) && !gone.has(child.id),
		),
	) as Scl.Ref<Scl.ElementsOf>[]
	const blocks = (await query.getRecords(blockRefs)).flatMap((record) =>
		record ? [toRawRecord(record) as AnyRawRecord] : [],
	)
	return dataSets.flatMap((dataSet) =>
		dataSetRemovalsOf({
			dataSetName: readAttribute({ record: dataSet, name: 'name', defaults: 'none' }),
			blocks: blocks.filter((block) => block.parent?.id === dataSet.parent?.id),
		}).map(({ block }) => ({
			element: { tagName: block.tagName, id: block.id },
			effect: 'cleared' as const,
		})),
	)
}

/**
 * The LNodes bound to a logical node the removal deletes, released at the commit as `releaseLNodesOfDeletedLogicalNodes`
 * releases them (by the logical node's uuid, or by its names): `cleared`.
 */
async function readReleasedLNodes(
	query: Core.Query<Config>,
	params: { subtree: readonly Scl.RawRecord<Scl.ElementsOf>[]; lnodeReads: LNodeReads },
): Promise<RemovalSideEffect[]> {
	const logicalNodes = params.subtree
		.filter((record) => LOGICAL_NODE_TAG_NAMES.has(record.tagName))
		.map((record) => toRawRecord(record) as AnyRawRecord)
	if (logicalNodes.length === 0) return []
	const keys = await readLogicalNodeKeys(query, { records: logicalNodes })
	const held = await params.lnodeReads.read()
	const lnodes = lnodesBoundTo({ lnodes: held, logicalNodes: keys })
	return lnodes.map((lnode) => ({
		element: { tagName: lnode.tagName, id: lnode.id },
		effect: 'cleared' as const,
	}))
}

/** The LNodes of the project, read once for a whole report, only when a removal deletes a logical node. */
function createLNodeReads(query: Core.Query<Config>): LNodeReads {
	let lnodes: Promise<AnyRawRecord[]> | undefined
	return {
		read: function readLNodes() {
			lnodes ??= query
				.getRecordsByTagName('LNode')
				.then((records) => records.map((record) => toRawRecord(record) as AnyRawRecord))
			return lnodes
		},
	}
}

/** Whether accepting a node deletes the element it names: a removal, or an element of the project's own. */
function removes(node: DiffNode): boolean {
	return node.change === 'removed' || node.change === 'target-only'
}
