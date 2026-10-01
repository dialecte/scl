import type { AnyRawRecord, ImportWarning, RecordPatch } from '@dialecte/core'

/** A `DOS` / `SDS` / `DAS` seen during the import pass. */
export type ImportedMappedDataNode = {
	tagName: 'DOS' | 'SDS' | 'DAS'
	name?: string
	ix?: string
	mappedName?: string
	mappedLnUuid?: string
	/** Record id of the nearest `DOS` / `SDS` above it. */
	parent?: string
	/** Record id of the `LNode` above it. */
	lnodeId?: string
}

/** The `LNode` attributes that tell which logical node it is mapped to. */
export type ImportedLNode = Record<
	'lnUuid' | 'iedName' | 'ldInst' | 'prefix' | 'lnClass' | 'lnInst',
	string | undefined
>

export type MappedDataImport = {
	/** Record one standardized record of the import pass, with its still-open parents. */
	collect(params: { record: AnyRawRecord; ancestry: readonly AnyRawRecord[] }): void
	/**
	 * After the pass: the updates that store every `DOS` / `SDS` / `DAS` in canonical form,
	 * and a warning per record whose implementation cannot be found in the file.
	 * `pathIndex`: element path -> uuid, as built by the import pass.
	 */
	resolve(params: { pathIndex: ReadonlyMap<string, string> }): Promise<{
		updates: RecordPatch[]
		warnings: ImportWarning[]
	}>
}
