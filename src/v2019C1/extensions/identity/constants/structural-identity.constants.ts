import type { Scl } from '@/v2019C1/config'

/**
 * Per uuid-less tag the schema gives no key, the attributes that tell its siblings apart: a value's setting group, the
 * file a file reference names, the data object an LNode's data object names. Added to the schema's `identityFields`
 * wherever an element is identified by its key (`keyFieldsOf`).
 */
export const STRUCTURAL_IDENTITY_FIELDS: ReadonlyMap<string, readonly string[]> = new Map<
	string,
	readonly string[]
>([
	['Val', ['sGroup'] satisfies Scl.AttributesOf<'Val'>[]],
	[
		'SclFileReference',
		['fileType', 'fileName', 'fileUuid'] satisfies Scl.AttributesOf<'SclFileReference'>[],
	],
	['DOS', ['name'] satisfies Scl.AttributesOf<'DOS'>[]],
])
