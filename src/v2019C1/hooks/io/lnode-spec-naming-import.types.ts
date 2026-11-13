import type { DerivedSpecificationNamingDiagnostic } from '@/v2019C1/errors/import-diagnostics.types'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

export type SpecNamingImport = {
	/** Record one standardized record of the import pass, with its still-open parents. */
	collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void
	/** How many LNodes the pass collected: what `resolve` goes over. */
	count(): number
	/**
	 * After the pass: the records giving every LNode without `LNodeSpecNaming` its own, and a
	 * diagnostic for each one taken from the naming of the logical node the LNode is bound to.
	 */
	resolve(): {
		/** The `LNodeSpecNaming` of every LNode, by LNode id: the file's and the ones made here. */
		namings: ReadonlyMap<string, AnyRawRecord>
		creates: AnyRawRecord[]
		updates: RecordPatch[]
		diagnostics: DerivedSpecificationNamingDiagnostic[]
	}
}
