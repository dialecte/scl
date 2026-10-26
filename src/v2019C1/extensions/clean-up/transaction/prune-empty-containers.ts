import { PRUNED_WHEN_EMPTY } from './prune-empty-containers.constants'

import { toRef } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { PruneEmptyContainersParams } from './prune-empty-containers.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const TRANSPARENT: readonly string[] = SCL_DIALECTE_CONFIG.transparentElements

/**
 * Delete the containers left holding nothing — no child element, no text — that have no reason to stay then
 * (`PRUNED_WHEN_EMPTY`: a transparent wrapper, an element whose definition needs a child), each walked up: the wrapper
 * a deleted category leaves empty goes too. Deleted through the transaction, so the delete hooks clean what refers to
 * a container removed.
 *
 * With `from`, only what the transaction emptied or created from that staged operation on is judged (a clone that
 * omitted what a wrapper held, the reference a removal took from its category); without it, the whole document.
 */
export async function pruneEmptyContainers(
	tx: Core.Transaction<Config>,
	params: PruneEmptyContainersParams = {},
): Promise<void> {
	const candidates =
		params.from === undefined ? await everyContainer(tx) : touchedSince(tx, { from: params.from })
	for (const candidate of candidates) await pruneUpward(tx, { ref: candidate })
}

/** Every element of the document whose tag is pruned when empty. */
async function everyContainer(tx: Core.Transaction<Config>): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const containers: Scl.Ref<Scl.ElementsOf>[] = []
	for (const tagName of PRUNED_WHEN_EMPTY) {
		const records = await tx.getRecordsByTagName(tagName as Scl.ElementsOf)
		containers.push(...records.map((record) => toRef(record) as Scl.Ref<Scl.ElementsOf>))
	}
	return containers
}

/**
 * What the transaction may have left holding nothing from its `from`-th operation on: the parent of an element it
 * deleted, and a wrapper it created (a clone that omitted what the wrapper held). An element it created otherwise is
 * the content it placed, judged by its own definition elsewhere.
 */
function touchedSince(
	tx: Core.Transaction<Config>,
	params: { from: number },
): Scl.Ref<Scl.ElementsOf>[] {
	const touched = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const operation of tx.getStagedOperations().slice(params.from)) {
		const emptied = emptiedBy(operation)
		if (emptied?.id && PRUNED_WHEN_EMPTY.has(emptied.tagName)) touched.set(emptied.id, emptied)
	}
	return [...touched.values()]
}

/** The element an operation may have emptied: the parent of a deleted element, a wrapper created. */
function emptiedBy(operation: Scl.Operation): Scl.Ref<Scl.ElementsOf> | undefined {
	switch (operation.status) {
		case 'deleted': {
			const { parent } = operation.oldRecord
			return parent
				? ({ tagName: parent.tagName, id: parent.id } as Scl.Ref<Scl.ElementsOf>)
				: undefined
		}
		case 'created': {
			const { tagName, id } = operation.newRecord
			return TRANSPARENT.includes(tagName)
				? ({ tagName, id } as Scl.Ref<Scl.ElementsOf>)
				: undefined
		}
		case 'updated':
			return undefined
	}
}

/** Delete the container while it holds nothing, then its parent the same way. */
async function pruneUpward(
	tx: Core.Transaction<Config>,
	params: { ref: Scl.Ref<Scl.ElementsOf> },
): Promise<void> {
	let ref: Scl.Ref<Scl.ElementsOf> | undefined = params.ref
	while (ref && PRUNED_WHEN_EMPTY.has(ref.tagName)) {
		const record: Scl.TrackedRecord<Scl.ElementsOf> | undefined = await tx.getRecord(ref)
		if (!record || record.children.length > 0 || record.value.trim() !== '' || !record.parent)
			return
		await tx.delete(ref)
		ref = toRef(record.parent) as Scl.Ref<Scl.ElementsOf>
	}
}
