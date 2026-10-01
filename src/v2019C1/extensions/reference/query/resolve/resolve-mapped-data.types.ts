import type { Scl } from '@/v2019C1/config'

/**
 * The data that implements a `DOS` / `SDS` / `DAS`: a logical node of an IED and the
 * path to the data inside it.
 */
export type MappedData = {
	/** The `LN` / `LN0` implementing the record. */
	ln: Scl.Ref<'LN' | 'LN0'>
	/** Path from that logical node: one segment per DO / SDO / DA / BDA, an array element as `name(n)`. */
	dataPath: readonly string[]
	/**
	 * `own`: the record names its implementation itself. `default`: it follows its
	 * parent data, or for a `DOS` the logical node its `LNode` is mapped to, keeping its own name.
	 */
	origin: 'own' | 'default'
}

export type ResolveMappedDataParams = {
	reference: Scl.Ref<'DOS' | 'SDS' | 'DAS'>
}
