import { TYPE_ID_REF_ATTRIBUTES } from '../constants'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Mechanically rewrite every type-id reference attribute (`lnType`, `DO.type`,
 * `SDO.type`, `DA.type`, `BDA.type`) in `records` whose current value appears in
 * `idRemap`. Registry-driven via {@link TYPE_ID_REF_ATTRIBUTES} (no hardcoded
 * tag list). Counterpart of the uuid-ref remap done by `afterDeepClone`, but for
 * the id-string type-reference system.
 *
 * Idempotent: an attribute whose value is not a key of `idRemap` (or maps to
 * itself) is left untouched.
 */
export async function applyTypeIdRemap(
	tx: Core.Transaction<Config>,
	params: {
		records: Scl.Ref<Scl.ElementsOf>[]
		idRemap: ReadonlyMap<string, string>
	},
): Promise<void> {
	const { records, idRemap } = params
	if (idRemap.size === 0) return

	for (const ref of records) {
		const attributes = TYPE_ID_REF_ATTRIBUTES.get(ref.tagName)
		if (!attributes) continue

		const record = await tx.getRecord(ref)
		if (!record) continue

		const updates: Record<string, string> = {}
		for (const attribute of attributes) {
			const current = record.attributes.find((a) => a.name === attribute)?.value
			if (!current) continue
			const next = idRemap.get(current)
			if (next !== undefined && next !== current) updates[attribute] = next
		}

		if (Object.keys(updates).length > 0) {
			await tx.update(record, { attributes: updates })
		}
	}
}
