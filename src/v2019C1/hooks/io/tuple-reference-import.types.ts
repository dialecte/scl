import type { AnyRawRecord, RecordPatch } from '@dialecte/core'

export type TupleReferenceImport = {
	/** Record one standardized record of the import pass, with its still-open parents. */
	collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void
	/** After the pass: the uuid of each tuple reference written without it, from the element its names name. */
	resolve(): { updates: RecordPatch[] }
}

/**
 * A tuple reference written without its uuid: the address its names name and the tags of the
 * elements it may point at (one, when its own attribute says which), kept from the pass.
 */
export type PendingTupleFill = {
	recordId: string
	uuidAttribute: string
	address: string
	targetTags: readonly string[]
}
