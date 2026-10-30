import type { CORPUS_KIND_FOLDERS } from './corpus.constants'

/** A kind of corpus file: the folder it sits in. */
export type CorpusKind = keyof typeof CORPUS_KIND_FOLDERS

/** Reads one corpus file's text; the files load one at a time. */
export type CorpusLoader = () => Promise<string>

/** The import diagnostics of a file, counted by code. */
export type ImportDiagnosticCounts = Readonly<Record<string, number>>

/** Why a file of the source is left out of the corpus, and since when. */
export type CorpusExclusion = {
	reason: string
	since: string
}

export type RunCorpusSmokeParams = {
	kind: CorpusKind
}

/** A corpus file as the sync reads it: its path, the Header that names its family and revision, its bytes' sha256. */
export type CorpusEntry = {
	path: string
	headerUuid: string
	version: string
	revision: string
	sha256: string
}

/**
 * The files of one Header uuid: the one the smoke runs (the latest revision that is not excluded; none when every
 * revision is), the other revisions kept aside for fork tests (a family of one revision has none), and the byte
 * duplicates dropped.
 */
export type CorpusFamily = {
	headerUuid: string
	smoke: CorpusEntry | undefined
	pairs: CorpusEntry[]
	duplicates: CorpusEntry[]
	/** The pairs with the smoke file's version and revision but other bytes: which one is the latest is not known. */
	sameRevision: CorpusEntry[]
	/** The only revision of a family of one, when excluded: copied nowhere. */
	excluded: CorpusEntry[]
}

export type PlanCorpusFamilyParams = {
	headerUuid: string
	members: readonly CorpusEntry[]
	excluded: (path: string) => boolean
}

export type PlanCorpusParams = {
	entries: readonly CorpusEntry[]
	excluded: (path: string) => boolean
}

/**
 * What the corpus sync is given: the corpus folder, the schema folder when the schemas are synced too, and whether
 * it only checks the excluded files.
 */
export type CorpusSyncArguments = {
	source: string
	xsdSource: string | undefined
	checkExcluded: boolean
}

/** The part of the JSON report of vitest the excluded-files check reads: each case's title and status. */
export type ExcludedCheckReport = {
	testResults: { assertionResults: { title: string; status: string }[] }[]
}

/** A corpus file the checks read: its path under the corpus folder and its text. */
export type CorpusFileCheckParams = {
	file: string
	xml: string
}

/** What the sync reports the excluded files from: the files of the source, and the pairs it keeps. */
export type ReportExcludedParams = {
	entries: readonly CorpusEntry[]
	pairs: readonly CorpusEntry[]
}

/** The source folder whose excluded files are checked where they are. */
export type CheckExcludedFilesParams = {
	source: string
}

/** The cases of the excluded-files report and the excluded file whose case is looked for. */
export type CaseStatusOfParams = {
	results: ExcludedCheckReport['testResults'][number]['assertionResults']
	file: string
}
