import { toRawRecord, widen } from '@dialecte/core/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

type ElementRecord = Scl.TrackedRecord<Scl.ElementsOf>

/**
 * Once the operations of a transaction deleted the last `PowerSystemRelation` of a
 * `PowerSystemRelations`, the container goes, and the `Private` wrapping it when nothing else is in it.
 * A container or wrapper deleted by the operations themselves is left alone.
 */
export async function pruneEmptiedPowerSystemRelations(params: {
	operations: ReadonlyArray<Scl.Operation>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { operations, query } = params
	const deletedIds = collectDeletedIds(operations)
	const operationsToStage: Scl.Operation[] = []

	for (const containerId of collectEmptiableContainerIds({ operations, deletedIds })) {
		const found = await query.getRecord({ tagName: 'PowerSystemRelations', id: containerId })
		const container = found && widen(found)
		if (!container?.parent || remainingChildren(container, deletedIds).length > 0) continue

		deletedIds.add(container.id)
		const wrapper = await getEmptiableWrapper({ container, deletedIds, query })
		operationsToStage.push(deleteOperation(container))

		if (wrapper) {
			deletedIds.add(wrapper.id)
			operationsToStage.push(deleteOperation(wrapper))
			operationsToStage.push(...(await detachFromParent({ record: wrapper, deletedIds, query })))
			continue
		}
		operationsToStage.push(...(await detachFromParent({ record: container, deletedIds, query })))
	}

	return operationsToStage
}

function collectDeletedIds(operations: ReadonlyArray<Scl.Operation>): Set<string> {
	const ids = new Set<string>()
	for (const operation of operations) {
		if (operation.status === 'deleted') ids.add(operation.oldRecord.id)
	}
	return ids
}

function collectEmptiableContainerIds(params: {
	operations: ReadonlyArray<Scl.Operation>
	deletedIds: Set<string>
}): Set<string> {
	const { operations, deletedIds } = params
	const containerIds = new Set<string>()
	for (const operation of operations) {
		if (operation.status !== 'deleted') continue
		if (operation.oldRecord.tagName !== 'PowerSystemRelation') continue
		const parent = operation.oldRecord.parent
		if (parent?.tagName === 'PowerSystemRelations' && !deletedIds.has(parent.id)) {
			containerIds.add(parent.id)
		}
	}
	return containerIds
}

async function getEmptiableWrapper(params: {
	container: ElementRecord
	deletedIds: Set<string>
	query: Core.Query<Config>
}): Promise<ElementRecord | undefined> {
	const { container, deletedIds, query } = params
	const wrapperRef = container.parent
	if (!wrapperRef || (wrapperRef.tagName as string) !== 'Private') return
	if (deletedIds.has(wrapperRef.id)) return

	const wrapper = await query.getRecord(wrapperRef)
	if (!wrapper?.parent) return
	return remainingChildren(wrapper, deletedIds).length === 0 ? widen(wrapper) : undefined
}

function remainingChildren(record: ElementRecord, deletedIds: Set<string>) {
	return record.children.filter((child) => !deletedIds.has(child.id))
}

function deleteOperation(record: ElementRecord): Scl.Operation {
	return { status: 'deleted', oldRecord: toRawRecord(record), newRecord: undefined }
}

async function detachFromParent(params: {
	record: ElementRecord
	deletedIds: Set<string>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, deletedIds, query } = params
	if (!record.parent || deletedIds.has(record.parent.id)) return []

	const parent = await query.getRecord(record.parent)
	if (!parent) return []

	const detached = {
		...parent,
		children: parent.children.filter((child) => child.id !== record.id),
	}
	return [{ status: 'updated', oldRecord: toRawRecord(parent), newRecord: toRawRecord(detached) }]
}
