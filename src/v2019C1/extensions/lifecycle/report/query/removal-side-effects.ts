import {
	collectUnusedTypes,
	createTypeReads,
	lostTypeNames,
} from '@/v2019C1/extensions/data-model/query/unused-types'
import {
	collectDeleteCascade,
	collectEmptiedAbove,
	readSubtreeRecords,
} from '@/v2019C1/hooks/before-delete'

import type { Config, Scl } from '@/v2019C1/config'
import type { TypeReads } from '@/v2019C1/extensions/data-model/query/unused-types.types'
import type {
	DecisionGroup,
	DiffNode,
	RemovalSideEffect,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Write on each group that removes elements what its removal does outside them (`DecisionGroup.sideEffects`), as the
 * delete hooks and the commit read it: the types the removal leaves unused (the removed elements were the last to
 * name them), the containers the removal leaves holding nothing that have no reason to stay, the references elsewhere
 * naming a removed element, deleted or cleared, and the containers and references those deletions take in turn. What
 * the group removes itself is not listed. A group is judged on its own: a type another group's removal also leaves
 * unused is not listed by either.
 */
export async function listRemovalSideEffects(
	query: Core.Query<Config>,
	params: { groups: readonly DecisionGroup[] },
): Promise<void> {
	// a report writes nothing: the data types are read once for all its groups
	const typeReads = createTypeReads(query)
	for (const group of params.groups) {
		const sideEffects = await readSideEffects(query, { group, typeReads })
		if (sideEffects.length > 0) group.sideEffects = sideEffects
	}
}

async function readSideEffects(
	query: Core.Query<Config>,
	params: { group: DecisionGroup; typeReads: TypeReads },
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
	return sideEffects
}

/** Whether accepting a node deletes the element it names: a removal, or an element of the project's own. */
function removes(node: DiffNode): boolean {
	return node.change === 'removed' || node.change === 'target-only'
}
