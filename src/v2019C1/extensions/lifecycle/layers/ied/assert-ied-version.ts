import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { readFileUuid } from '@/v2019C1/extensions/lifecycle/read-file-uuid'
import { readDocumentFileType } from '@/v2019C1/extensions/lifecycle/source-file-type'
import { IED_ROOT_TAG } from '@/v2019C1/extensions/lifecycle/source-root/source-root.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { AssertIedVersionParams, NotAVersionReason } from './assert-ied-version.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Refuse, before anything is read further, a fork on an open ISD document of a file that is not a version of it, with
 * `NOT_A_VERSION_OF_FILE`. The Header uuid names a file across its versions and revisions, and the IED keeps its uuid
 * from one version to the next:
 *  - the Headers name different files: `reason: 'other-file'`, `fileUuid`, `otherFileUuid` (a re-extraction of the same
 *    IED is another file). A Header naming no file names none of the open ISD: an import gives every Header a fresh
 *    uuid, so a file imported without one is another file, and the IEDs' uuids do not stand in for it;
 *  - the same file, but the open ISD holds no IED of the other file's IED uuid: `reason: 'other-ied'`, `iedUuid` (the
 *    open ISD's first IED's, which an ISD holds one of), `otherIedUuid`; a uuid neither IED carries is left out.
 * A document of another type than an ISD (a project) is not checked: its fork is a first placement. One read each of
 * the two Headers and of the open ISD's IEDs.
 */
export async function assertIedVersion(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: AssertIedVersionParams,
): Promise<void> {
	const { sourceQuery, otherIedUuid, operation } = params
	if ((await readDocumentFileType(reader)) !== 'ISD') return
	const fileUuid = await readFileUuid(reader)
	const otherFileUuid = await readFileUuid(sourceQuery)
	if (!fileUuid || fileUuid !== otherFileUuid)
		return refuse({
			reason: 'other-file',
			meta: definedOnly({ fileUuid, otherFileUuid }),
			operation,
		})
	const iedUuids = (await reader.getRecordsByTagName(IED_ROOT_TAG)).map(
		(record) => readAttribute({ record, name: 'uuid' }) || undefined,
	)
	if (otherIedUuid && iedUuids.includes(otherIedUuid)) return
	const [iedUuid] = iedUuids
	refuse({
		reason: 'other-ied',
		meta: definedOnly({ iedUuid, otherIedUuid }),
		operation,
	})
}

/** Throw `NOT_A_VERSION_OF_FILE` for one reason, with what names the files or the IEDs. */
function refuse(params: {
	reason: NotAVersionReason
	meta: Record<string, string>
	operation: AssertIedVersionParams['operation']
}): never {
	const { reason, meta, operation } = params
	return throwDialecteError(SCL_ERRORS.NOT_A_VERSION_OF_FILE, {
		meta: { reason, ...meta },
		detail: `${operation}: the file is not a version of the open ISD (${reason})`,
	})
}

/** The entries of a meta that hold a value: a uuid a document does not give is left out, never `undefined`. */
function definedOnly(entries: Record<string, string | undefined>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(entries).filter((entry): entry is [string, string] => entry[1] !== undefined),
	)
}
