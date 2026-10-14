import type { DerivedSpecificationNamingWarning } from './io-hooks.types'
import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

export type SpecNamingImport = {
	/** Record one standardized record of the import pass, with its still-open parents. */
	collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void
	/**
	 * After the pass: the records giving every LNode without `LNodeSpecNaming` its own, and a
	 * warning for each one taken from the naming of the logical node the LNode is bound to.
	 */
	resolve(): {
		creates: AnyRawRecord[]
		updates: RecordPatch[]
		warnings: DerivedSpecificationNamingWarning[]
	}
}
