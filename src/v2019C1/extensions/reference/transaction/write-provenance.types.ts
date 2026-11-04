import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** SCL file type recorded on an `SclFileReference` (the Header `fileType` domain). */
export type SclFileType = 'FSD' | 'ASD' | 'SSD' | 'ISD' | 'ICD' | 'IID' | 'SCD' | 'SED' | 'CID'

/**
 * Where a provenance link is anchored.
 * - `function` / `application` — a per-root `FunctionSclRef` / `ApplicationSclRef` on the cloned
 *   root (FSD / ASD); the `fileType` is implied by the anchor.
 * - `document` — a `Header > SourceFiles > SclFileReference` recording the whole source file for the
 *   document (SSD / SCD / …), appended to the target `Header` (no per-root wrapper exists).
 */
export type ProvenanceTarget =
	| { anchor: 'function'; root: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'> }
	| { anchor: 'application'; root: Scl.Ref<'Application'> }
	| { anchor: 'document'; fileType: SclFileType }

/** The attributes of a source-file reference, as the writer builds them from the source (an absent value empty). */
export type SclFileReferenceValues = {
	fileType: SclFileType
	version: string
	revision: string
	fileName: string
	fileUuid: string
}

/** What `writeProvenance` did. */
export type WriteProvenanceResult = {
	/**
	 * Whether it changed what is recorded: a reference added, or one brought to another version, or a second reference
	 * to the same file removed. `false` when the element records that file version already, as its only reference to
	 * that file (or the `Header` lists that file version already).
	 */
	changed: boolean
}

export type WriteProvenanceParams = {
	/** Query over the source document the provenance is sourced from (Header + file name). */
	sourceQuery: Core.Query<Config>
	/** Where + how to anchor the link. */
	target: ProvenanceTarget
}
