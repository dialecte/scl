import { MAPPED_NAME_REFS } from '@/v2019C1/extensions/reference'
import { buildMappedName } from '@/v2019C1/extensions/reference/query/build'
import { updatedOperation, upsertAttribute } from '@/v2019C1/hooks/shared/record-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Reconcile a `DOS`/`SDS`/`DAS` record's mapped-name attribute
 * (`mappedDoName`/`mappedDaName`) to its documentation form as a side effect of
 * create/update: the implementing short name, present only when it differs from
 * the specified `name`, otherwise omitted.
 *
 * Applies only when the LN is mapped by UUID (`mappedLnUuid` present) — the
 * unmapped-LN case authors a full ObjectReference that dialecte must leave intact.
 * Returns an update operation, or `null` when the record is already conformant or
 * the rule does not apply.
 */
export async function reconcileMappedName(
	query: Core.Query<Config>,
	record: Scl.RawRecord<Scl.ElementsOf>,
): Promise<Scl.Operation | null> {
	const spec = MAPPED_NAME_REFS.get(record.tagName)
	if (!spec) return null

	const mappedLnUuid = record.attributes.find((a) => a.name === spec.uuid)?.value
	if (!mappedLnUuid) return null

	const desired = await buildMappedName(query, record)
	const current = record.attributes.find((a) => a.name === spec.path)?.value
	if (desired === current) return null

	const attributes =
		desired === undefined
			? record.attributes.filter((a) => a.name !== spec.path)
			: upsertAttribute(record.attributes, spec.path, desired)

	return updatedOperation(record, attributes)
}
