import {
	appendEntryOperations,
	createWrapperOperations,
	findProjectEntries,
	foldEntryOperations,
} from './entry-operations'

import type { ScdFileReference } from './min-requested-scd-file.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Make each IED's `MinRequestedSCDFiles` reference the current SCD: the entry whose `fileUuid` is
 * the `Header` uuid is created or brought up to the Header version and revision. Entries of other
 * projects are left untouched; duplicate entries of the current project are folded into one.
 *
 * Without a `Header` uuid there is no SCD to reference, so nothing is written.
 */
export async function syncMinRequestedScdFiles(
	query: Core.Query<Config>,
	params: { iedRefs: Scl.Ref<'IED'>[] },
): Promise<Scl.Operation[]> {
	const { iedRefs } = params
	if (iedRefs.length === 0) return []

	const scdFile = await readCurrentScdFile(query)
	if (!scdFile) return []

	const operations: Scl.Operation[] = []
	const syncedIedIds = new Set<string>()
	for (const iedRef of iedRefs) {
		if (syncedIedIds.has(iedRef.id)) continue
		syncedIedIds.add(iedRef.id)

		const iedOperations = await syncIed(query, { iedRef, scdFile })
		operations.push(...iedOperations)
	}
	return operations
}

async function readCurrentScdFile(query: Core.Query<Config>): Promise<ScdFileReference | null> {
	const [header] = await query.getRecordsByTagName('Header')
	if (!header) return null

	const { uuid, version, revision } = await query.getAttributes(header)
	const fileUuid = uuid?.trim()
	if (!fileUuid) return null

	// A missing version or revision is reported by validation; the entry takes it as empty.
	return {
		fileType: 'SCD',
		fileUuid,
		version: version?.trim() ?? '',
		revision: revision?.trim() ?? '',
	}
}

async function syncIed(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; scdFile: ScdFileReference },
): Promise<Scl.Operation[]> {
	const { iedRef, scdFile } = params

	const ied = await query.getRecord(iedRef)
	if (!ied) return []

	const wrapper = await query.getChild(ied, 'MinRequestedSCDFiles')
	if (!wrapper) return createWrapperOperations({ ied, scdFile })

	const [kept, ...duplicates] = await findProjectEntries(query, {
		wrapper,
		fileUuid: scdFile.fileUuid,
	})
	if (!kept) return appendEntryOperations({ wrapper, scdFile })

	return foldEntryOperations(query, { wrapper, kept, duplicates, scdFile })
}
