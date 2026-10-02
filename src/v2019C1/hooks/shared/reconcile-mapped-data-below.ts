import { toRawRecord } from '@dialecte/core/helpers'

import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { reconcileMappedData } from '@/v2019C1/hooks/shared/reconcile-mapped-data'

import type { ReconcileMappedDataParams } from './reconcile-mapped-data.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * After a change to an `LNode` or a `DOS` / `SDS` that moves the default of the data below it,
 * re-store every `DOS` / `SDS` / `DAS` below that names its implementation: an implementation
 * that became the default loses its attributes. Records that name nothing follow the new
 * default by themselves.
 */
export async function reconcileMappedDataBelow(
	query: Core.Query<Config>,
	params: ReconcileMappedDataParams,
): Promise<Scl.Operation[]> {
	const { record } = params
	const descendants = await query.findDescendants({
		tagName: record.tagName,
		id: record.id,
	} as Scl.Ref<Scl.ElementsOf>)

	const operations: Scl.Operation[] = []
	for (const [tagName, attributeNames] of MAPPED_NAME_REFS) {
		const records = (descendants as Record<string, Scl.TrackedRecord<Scl.ElementsOf>[]>)[tagName]
		for (const descendant of records ?? []) {
			if (descendant.id === record.id) continue
			const namesImplementation = descendant.attributes.some(
				(attribute) =>
					attribute.name === attributeNames.path || attribute.name === attributeNames.uuid,
			)
			if (!namesImplementation) continue
			const operation = await reconcileMappedData(query, { record: toRawRecord(descendant) })
			if (operation) operations.push(operation)
		}
	}
	return operations
}
