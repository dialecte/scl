import { findDataSetUsers } from './find-data-set-users'
import { updatedOperation, upsertAttribute } from './record-ops'

import { toRawRecord } from '@dialecte/core/helpers'

import { readAttribute } from '@/v2019C1/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * When a DataSet is renamed, the control blocks of its logical node publishing it (`datSet`) write the
 * new name: a control block names its data set by name only.
 */
export async function followDataSetRename(
	query: Core.Query<Config>,
	params: { oldRecord: Scl.RawRecord<Scl.ElementsOf>; newRecord: Scl.RawRecord<Scl.ElementsOf> },
): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord } = params
	if (newRecord.tagName !== 'DataSet' || !newRecord.parent) return []
	const oldName = readAttribute({ record: oldRecord, name: 'name' })
	const newName = readAttribute({ record: newRecord, name: 'name' })
	if (!oldName || !newName || oldName === newName) return []

	// The stored record may already carry the new name; the users still name the old one.
	const records = await findDataSetUsers(query, {
		dataSet: { tagName: 'DataSet', id: newRecord.id },
		name: oldName,
	})

	const operations: Scl.Operation[] = []
	for (const record of records) {
		if (!record) continue
		const raw = toRawRecord(record) as Scl.RawRecord<Scl.ElementsOf>
		if (readAttribute({ record: raw, name: 'datSet', defaults: 'none' }) !== oldName) continue
		operations.push(updatedOperation(raw, upsertAttribute(raw.attributes, 'datSet', newName)))
	}
	return operations
}
