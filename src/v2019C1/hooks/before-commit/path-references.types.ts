import type { SclImportDiagnostic } from '@/v2019C1/errors'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

/** A path reference the commit resolves: its record, the pairs to resolve, and whether it holds their uuid. */
export type PathCandidate = {
	record: AnyRawRecord
	pairs: readonly ReferencePair[]
	holdsUuid: boolean
}

/** The path segment names a commit gave (created or renamed elements); `every` when any name may count. */
export type TouchedNames = { every: boolean; names: ReadonlySet<string> }

/** What the import session gave the candidates of a commit: their patches, and what it said of each, by record id. */
export type ImportedResolution = {
	patches: Map<string, RecordPatch>
	diagnostics: Map<string, SclImportDiagnostic[]>
}
