import {
	collectDeleteCascade,
	collectEmptiedAbove,
	collectSubtreeIds,
} from '@/v2019C1/hooks/before-delete'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionGroup,
	DiffNode,
	RemovalSideEffect,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Write on each group that removes elements what its removal does outside them (`DecisionGroup.sideEffects`), as the
 * delete hooks and the commit read it: the containers the removal leaves holding nothing that have no reason to stay,
 * the references elsewhere naming a removed element, deleted or cleared, and the containers and references those
 * deletions take in turn. What the group removes itself is not listed.
 */
export async function listRemovalSideEffects(
	query: Core.Query<Config>,
	params: { groups: readonly DecisionGroup[] },
): Promise<void> {
	for (const group of params.groups) {
		const sideEffects = await readSideEffects(query, { group })
		if (sideEffects.length > 0) group.sideEffects = sideEffects
	}
}

async function readSideEffects(
	query: Core.Query<Config>,
	params: { group: DecisionGroup },
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
	const gone = await collectSubtreeIds(query, { records: roots })

	// the containers the removal leaves holding nothing go at the commit, with what refers to them
	const emptied: Scl.TrackedRecord<Scl.ElementsOf>[] = []
	for (const root of roots)
		emptied.push(...(await collectEmptiedAbove(query, { record: root, gone })))
	const cascade = await collectDeleteCascade(query, { roots: [...roots, ...emptied] })

	const sideEffects: RemovalSideEffect[] = []
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
