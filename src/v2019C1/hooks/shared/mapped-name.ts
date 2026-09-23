import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference'
import { computeMappedReferenceAttributes } from '@/v2019C1/extensions/reference/query/build'
import {
	updatedOperation,
	upsertAttribute,
	type AttributeList,
} from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** Reconcile mapped-name documentation and its LN UUID companion atomically. */
export async function reconcileMappedName(
	query: Core.Query<Config>,
	record: Scl.RawRecord<Scl.ElementsOf>,
): Promise<Scl.Operation | null> {
	const spec = MAPPED_NAME_REFS.get(record.tagName)
	if (!spec) return null

	const desired = await computeMappedReferenceAttributes(query, { record })
	if (!desired) return null

	const currentName = record.attributes.find((attribute) => attribute.name === spec.path)?.value
	const currentUuid = record.attributes.find((attribute) => attribute.name === spec.uuid)?.value
	if (desired.mappedName === currentName && desired.mappedLnUuid === currentUuid) return null

	let attributes: AttributeList = record.attributes.filter(
		(attribute) => attribute.name !== spec.path && attribute.name !== spec.uuid,
	)
	if (desired.mappedName !== undefined) {
		attributes = upsertAttribute(attributes, spec.path, desired.mappedName)
	}
	if (desired.mappedLnUuid !== undefined) {
		attributes = upsertAttribute(attributes, spec.uuid, desired.mappedLnUuid)
	}

	return updatedOperation(record, attributes)
}
