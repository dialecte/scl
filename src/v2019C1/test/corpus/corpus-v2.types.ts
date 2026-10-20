import type { CORPUS_V2_KIND_FOLDERS } from './corpus-v2.constants'

/** A kind of corpus file: the folder it sits in. */
export type CorpusV2Kind = keyof typeof CORPUS_V2_KIND_FOLDERS

/** The checks of a corpus file: the file itself, then its import and export. */
export type CorpusV2Check = 'file' | 'import'

/** Reads one corpus file's text; the files load one at a time. */
export type CorpusV2Loader = () => Promise<string>

/** The import warnings of a file, counted by type. */
export type ImportWarningCounts = Readonly<Record<string, number>>

/** Why a corpus file is not truth, since when, and what the check of the file itself gives on it. */
export type CorpusV2Quarantine = {
	reason: string
	since: string
	fileCheck: 'fails' | 'passes'
}

/** The engine defect a truth file meets, since when, and the checks it fails. */
export type CorpusV2EngineDefect = {
	reason: string
	since: string
	failingChecks: readonly CorpusV2Check[]
}

export type RunCorpusV2SmokeParams = {
	kind: CorpusV2Kind
}

/** A corpus file as the sync reads it: its path, the Header that names its family and revision, its bytes' sha256. */
export type CorpusV2Entry = {
	path: string
	headerUuid: string
	version: string
	revision: string
	sha256: string
}

/**
 * The files of one Header uuid: the one the smoke runs (the latest revision that is not quarantined, or the latest
 * when every revision is), the older or quarantined revisions kept aside for fork tests, and the byte duplicates
 * dropped.
 */
export type CorpusV2Family = {
	headerUuid: string
	smoke: CorpusV2Entry
	pairs: CorpusV2Entry[]
	duplicates: CorpusV2Entry[]
	/** The pairs with the smoke file's version and revision but other bytes: which one is the latest is not known. */
	sameRevision: CorpusV2Entry[]
}

export type PlanCorpusV2FamilyParams = {
	headerUuid: string
	members: readonly CorpusV2Entry[]
	quarantined: (path: string) => boolean
}

export type PlanCorpusV2Params = {
	entries: readonly CorpusV2Entry[]
	quarantined: (path: string) => boolean
}

/** What the corpus sync is given: the corpus folder, and the schema folder when the schemas are synced too. */
export type CorpusV2SyncArguments = { source: string; xsdSource: string | undefined }
