import { toRef } from '@dialecte/core/helpers'

import { JUDGED_ATTRIBUTES_BY_TAG } from '@/v2019C1/extensions/clean-up/transaction/orphan-lnode-bindings.constants'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The LNodes, data and signals whose implementation a transaction wrote from its `from`-th staged
 * operation on, each once: those it created, and those it updated on an attribute naming what
 * implements them (an `LNode`'s binding, the uuid of a reference of its data or signals). An element
 * only touched otherwise — a child added under it, a description changed — is left out, and so is
 * one deleted again since.
 */
export function collectWrittenImplementation(
	tx: Core.Transaction<Config>,
	params: { from: number },
): Scl.Ref<Scl.ElementsOf>[] {
	const written = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const operation of tx.getStagedOperations().slice(params.from)) {
		if (operation.status === 'deleted') {
			written.delete(operation.oldRecord.id)
			continue
		}
		const { newRecord } = operation
		const judged = JUDGED_ATTRIBUTES_BY_TAG.get(newRecord.tagName)
		if (!judged || written.has(newRecord.id)) continue
		if (operation.status === 'updated' && !changesAny({ operation, names: judged })) continue
		written.set(newRecord.id, toRef(newRecord) as Scl.Ref<Scl.ElementsOf>)
	}
	return [...written.values()]
}

/** Whether an update changed one of `names` on its record. */
function changesAny(params: {
	operation: { oldRecord: Scl.RawRecord<Scl.ElementsOf>; newRecord: Scl.RawRecord<Scl.ElementsOf> }
	names: ReadonlySet<string>
}): boolean {
	const { operation, names } = params
	for (const name of names) {
		const before = operation.oldRecord.attributes.find((attribute) => attribute.name === name)
		const after = operation.newRecord.attributes.find((attribute) => attribute.name === name)
		if (before?.value !== after?.value) return true
	}
	return false
}
