import { syncMinRequestedScdFileOnUpdate } from './min-requested-scd-file'
import { updateRefPaths } from './ref-paths'

import { widen } from '@dialecte/core/helpers'

import {
	hasAttributeChange,
	reconcileSignalSiblingPaths,
	signalName,
	signalNamingAttributes,
} from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * When a target element is renamed, recalculate path attrs on all ref elements
 * pointing to it via UUID (see ref-paths.ts), and sync the affected IEDs'
 * minimum requested SCD file (see min-requested-scd-file.ts).
 */
export async function afterUpdated<GenericElement extends Scl.ElementsOf>(params: {
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params

	const refPathOps = await updateRefPaths(params)
	const minRequestedScdFileOps = await syncMinRequestedScdFileOnUpdate(query, {
		oldRecord,
		newRecord,
	})
	const siblingOps = await reconcileSiblingsOfUpdatedSignal(query, {
		oldRecord: widen(oldRecord),
		newRecord: widen(newRecord),
	})

	return [...refPathOps, ...minRequestedScdFileOps, ...siblingOps]
}

/**
 * A signal whose name or instance changed renames the references to its siblings: those that
 * shared its former name and those that share its new one (see signal-sibling-paths.ts).
 */
async function reconcileSiblingsOfUpdatedSignal(
	query: Core.Query<Config>,
	params: {
		oldRecord: Scl.RawRecord<Scl.ElementsOf>
		newRecord: Scl.RawRecord<Scl.ElementsOf>
	},
): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord } = params
	const names = signalNamingAttributes(newRecord.tagName)
	if (!hasAttributeChange({ oldRecord, newRecord, names })) return []

	const oldName = signalName(oldRecord)
	const newName = signalName(newRecord)
	if ((!oldName && !newName) || !newRecord.parent) return []

	return reconcileSignalSiblingPaths(query, {
		parent: newRecord.parent as Scl.Ref<Scl.ElementsOf>,
		tagName: newRecord.tagName,
		names: [...new Set([oldName, newName].filter((name): name is string => Boolean(name)))],
	})
}
