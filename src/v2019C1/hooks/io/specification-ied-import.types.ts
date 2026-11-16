import type { SpecifiedLNode } from '@/v2019C1/extensions/data-model/naming/specification-ied.types'
import type { AnyRawRecord } from '@dialecte/core'

/** What an import needs to tell the specification IED an LNode is specified on, gathered in the import pass. */
export type SpecificationIedImport = {
	/** Record one standardized record of the import pass, with its still-open parents. */
	collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void
	/**
	 * After the pass: each LNode as a new `LNodeSpecNaming` reads it (its specification IED, the names to build from),
	 * read from the IEDs and logical nodes collected.
	 */
	resolver(): (params: { lnode: AnyRawRecord }) => SpecifiedLNode
}
