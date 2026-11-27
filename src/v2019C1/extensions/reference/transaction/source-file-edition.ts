import { CURRENT_EDITION, FIRST_EDITION } from './source-file-edition.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type { CompareEditionsParams, SclEdition } from './source-file-edition.types'
import type { AnyRawRecord, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The SCL edition a document's root states (`version`, `revision`, `release`), as written. A root stating no version is
 * a first-edition file (2003, no revision, no release); a document created in the tool states the edition the schema
 * fixes on its root, so it reads as the current one.
 */
export function readSclEdition(root: AnyRawRecord | AnyTrackedRecord | AnyTreeRecord): SclEdition {
	const version = readAttribute({ record: root, name: 'version', defaults: 'none' })
	if (!version) return FIRST_EDITION
	return {
		version,
		revision: readAttribute({ record: root, name: 'revision', defaults: 'none' }) || undefined,
		release: readAttribute({ record: root, name: 'release', defaults: 'none' }) || undefined,
	}
}

/**
 * Whether a file of this edition names itself with a uuid its Header holds: from 2007 C 5 on. A file of an earlier
 * edition holds no file uuid of its own; the one an import gives its Header is no identity of the file.
 *
 * @intent does a file carry its own identity, is the Header uuid authored or minted, was the file uuid invented on import
 */
export function holdsOwnFileIdentity(edition: SclEdition): boolean {
	return !isPreviousEdition(edition)
}

/**
 * Whether a file is of an edition before the one this dialecte reads (2007 C 5): the edition the Header uuid and the
 * original edition of an IED came with, so such a file holds neither.
 */
export function isPreviousEdition(edition: SclEdition): boolean {
	return compareEditions({ edition, other: CURRENT_EDITION }) < 0
}

/** Negative when `edition` is earlier than `other`, zero when equal, positive when later; a part not given reads lowest. */
function compareEditions(params: CompareEditionsParams): number {
	const { edition, other } = params
	const version = Number(edition.version ?? 0) - Number(other.version ?? 0)
	if (version !== 0) return version
	const revision = (edition.revision ?? '').localeCompare(other.revision ?? '')
	if (revision !== 0) return revision
	return Number(edition.release ?? 0) - Number(other.release ?? 0)
}
