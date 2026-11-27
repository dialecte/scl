import { REAL_DEVICE_FILE_TYPES } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.constants'
import {
	isPreviousEdition,
	readSclEdition,
} from '@/v2019C1/extensions/reference/transaction/source-file-edition'
import { FIRST_EDITION } from '@/v2019C1/extensions/reference/transaction/source-file-edition.constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { FillOriginalEditionParams, OriginalEdition } from './original-edition.types'
import type { Config } from '@/v2019C1/config'
import type { SclEdition } from '@/v2019C1/extensions/reference/transaction/source-file-edition.types'
import type * as Core from '@dialecte/core'

/**
 * Give an IED placed from a device file (an ICD, an IID) of a previous edition (before 2007 C 5) that states no original
 * edition the edition of its file (`originalEditionOf`), as an import upgrades such a file. One that states it keeps it;
 * an IED of a file of the current edition stating none keeps the schema's default; an IED placed from another file is
 * left as it is.
 */
export async function fillOriginalEdition(
	tx: Core.Transaction<Config>,
	params: FillOriginalEditionParams,
): Promise<void> {
	const { sourceQuery, placed, fileType } = params
	if (!REAL_DEVICE_FILE_TYPES.has(fileType)) return
	const record = await tx.getRecord(placed)
	// the schema gives the attribute a default (2003): only one the IED writes is stated
	if (!record || readAttribute({ record, name: 'originalSclVersion', defaults: 'none' })) return
	const sourceRoot = await sourceQuery.getRoot()
	const edition = readSclEdition(sourceRoot)
	// a file of an edition before the current one (2007 C 5) is upgraded on import (6-amd.md:785, I.4.3.3 at
	// 6-amd.md:3093-3101); a 2007 C file of a release below 5 is ordered before it too, the release being part of the
	// edition the attributes state
	if (!isPreviousEdition(edition)) return
	await tx.update(placed, { attributes: originalEditionOf(edition) })
}

/**
 * The original edition an IED placed from a file of this edition records when it states none: the file's version,
 * revision and release (each states the original file's, 6-amd.md:785), no revision for a 2003 file (I.4.3.3,
 * 6-amd.md:3099).
 */
function originalEditionOf(edition: SclEdition): OriginalEdition {
	const { version, revision, release } = edition
	if (version === FIRST_EDITION.version) return { originalSclVersion: version }
	return {
		...(version ? { originalSclVersion: version } : {}),
		...(revision ? { originalSclRevision: revision } : {}),
		...(release ? { originalSclRelease: release } : {}),
	}
}
