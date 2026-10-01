import type { Scl } from '@/v2019C1/config'

export type SetMappedDataParams = {
	reference: Scl.Ref<'DOS' | 'SDS' | 'DAS'>
	/**
	 * The logical node and the data path inside it that implement the record, one segment per
	 * DO / SDO / DA / BDA. Omit it to let the record follow its default.
	 */
	implementation?: {
		ln: Scl.Ref<'LN' | 'LN0'>
		dataPath: readonly string[]
	}
}

/**
 * - `stored`: the record carries the path and the logical node uuid.
 * - `default`: the implementation is the record's default; it carries neither attribute.
 * - `inexpressible`: the schema has no value for this data path on this record; nothing was
 *   written (document the deviation on the `DAS` below instead).
 */
export type SetMappedDataResult = { kind: 'stored' | 'default' | 'inexpressible' }
