import { isElementOf, toRawRecord } from '@dialecte/core/helpers'

import { Scl, SCL_DIALECTE_CONFIG, Config } from '@/v2019C1/config'
import {
	reference as referenceApi,
	RESOLVABLE_RESOLUTIONS,
	RESOLUTION_TARGET_REFS,
} from '@/v2019C1/extensions/reference'

import type { RefEntry } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

export async function updateRefsForEntry(params: {
	uuid: string
	entry: RefEntry
	target: Scl.Ref<Scl.ElementsOf>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { uuid, entry, target, query } = params

	if (!isElementOf(entry.refTagName, SCL_DIALECTE_CONFIG)) return []

	const refRecords = await query.getRecordsByTagName(entry.refTagName)
	const operations: Scl.Operation[] = []

	for (const refRecord of refRecords) {
		const uuidValue = refRecord.attributes.find(
			(attribute) => attribute.name === entry.uuidAttr,
		)?.value
		if (uuidValue !== uuid) continue

		const reference = { tagName: refRecord.tagName, id: refRecord.id } as Scl.Ref<Scl.ElementsOf>
		const newPath = await referenceApi.query.buildReferencePath(query, { reference, target })
		if (!newPath) continue

		const currentPath = refRecord.attributes.find(
			(attribute) => attribute.name === entry.pathAttr,
		)?.value
		if (currentPath === newPath) continue

		const updatedAttributes = refRecord.attributes.map((attribute) =>
			attribute.name === entry.pathAttr ? { ...attribute, value: newPath } : attribute,
		)

		operations.push({
			status: 'updated',
			oldRecord: toRawRecord(refRecord),
			newRecord: toRawRecord({ ...refRecord, attributes: updatedAttributes }),
		})
	}

	return operations
}

export function getRefEntriesForTarget(tagName: string): RefEntry[] {
	const entries: RefEntry[] = []
	for (const resolution of RESOLVABLE_RESOLUTIONS) {
		const found = RESOLUTION_TARGET_REFS[resolution].get(tagName)
		if (found) entries.push(...found)
	}
	return entries
}
