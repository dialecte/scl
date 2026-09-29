import { resolveOwningIed } from './resolve-owning-ied'
import { syncMinRequestedScdFile } from './sync-min-requested-scd-file'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const ownersByDeletedRecord = new WeakMap<object, Scl.Ref<'IED'>[]>()

export async function captureAffectedIedsBeforeDelete<
	GenericElement extends Scl.ElementsOf,
>(params: { record: Scl.RawRecord<GenericElement>; query: Core.Query<Config> }): Promise<void> {
	const { record, query } = params
	const owners = new Map<string, Scl.Ref<'IED'>>()

	async function visit<Element extends Scl.ElementsOf>(
		current: Scl.RawRecord<Element>,
	): Promise<void> {
		const owner = await resolveOwningIed({ record: current, query })
		if (owner) owners.set(owner.id, owner)

		for (const childRef of current.children) {
			const child = await query.getRecord(childRef)
			if (child) await visit(child)
		}
	}

	await visit(record)
	ownersByDeletedRecord.set(record, [...owners.values()])
}

export async function syncMinRequestedScdFileOnDelete<
	GenericElement extends Scl.ElementsOf,
>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { record, query } = params
	const owners = ownersByDeletedRecord.get(record)
	ownersByDeletedRecord.delete(record)
	if (!owners) return []

	const operations: Scl.Operation[] = []
	for (const iedRef of owners) {
		operations.push(...(await syncMinRequestedScdFile({ iedRef, query })))
	}
	return operations
}
