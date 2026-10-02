import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference/constants'
import { buildMappedDataAttributes } from '@/v2019C1/extensions/reference/query/build/build-mapped-data-attributes'
import { resolveMappedDataAndDefault } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-data-and-default'
import {
	readSnapshotAttribute,
	updatedOperation,
	upsertAttribute,
} from '@/v2019C1/hooks/shared/record-ops'

import type { ReconcileMappedDataParams } from './reconcile-mapped-data.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { AttributeList } from '@/v2019C1/hooks/shared/record-ops'
import type * as Core from '@dialecte/core'

/**
 * Store a `DOS` / `SDS` / `DAS` implementation in its canonical form: nothing when the record
 * is implemented by its default, otherwise the data path from the implementing logical node
 * (`mappedDoName` / `mappedDaName`) together with that logical node's uuid (`mappedLnUuid`).
 *
 * Acts only on a record that names its implementation; leaves it untouched when the
 * implementation cannot be resolved or the schema has no value for its data path.
 * Returns an update operation, or `null` when the record is already canonical.
 */
export async function reconcileMappedData(
	query: Core.Query<Config>,
	params: ReconcileMappedDataParams,
): Promise<Scl.Operation | null> {
	const { record } = params
	const attributeNames = MAPPED_NAME_REFS.get(record.tagName)
	if (!attributeNames) return null

	const reference = { tagName: record.tagName, id: record.id } as Scl.Ref<'DOS' | 'SDS' | 'DAS'>
	const { mappedData, defaultData } = await resolveMappedDataAndDefault(query, { reference })
	if (mappedData?.origin !== 'own') return null

	const lnUuid = await query.getAttribute(mappedData.ln, { name: 'uuid' })
	if (!lnUuid) return null

	const attributes = buildMappedDataAttributes({
		tagName: reference.tagName,
		implementation: { lnId: mappedData.ln.id, lnUuid, dataPath: mappedData.dataPath },
		defaultData: defaultData && { lnId: defaultData.ln?.id, dataPath: defaultData.dataPath },
	})
	if (attributes.kind === 'inexpressible') return null

	const desired =
		attributes.kind === 'default'
			? {}
			: {
					[attributeNames.path]: attributes.mappedName,
					[attributeNames.uuid]: attributes.mappedLnUuid,
				}

	const unchanged = [attributeNames.path, attributeNames.uuid].every(
		(name) => readSnapshotAttribute({ record, name }) === desired[name],
	)
	if (unchanged) return null

	let nextAttributes: AttributeList = record.attributes.filter(
		(attribute) => attribute.name !== attributeNames.path && attribute.name !== attributeNames.uuid,
	)
	for (const [name, value] of Object.entries(desired)) {
		nextAttributes = upsertAttribute(nextAttributes, name, value)
	}
	return updatedOperation(record, nextAttributes)
}
