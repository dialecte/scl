import type { MappedData, ResolveMappedDataParams } from './resolve-mapped-data.types'
import type { MappedLNodes } from './resolve-mapped-lnodes.types'
import type { Scl } from '@/v2019C1/config'

/** What a record follows when it names nothing itself; the logical node may be unknown. */
export type MappedDataDefaultRef = {
	ln?: Scl.Ref<'LN' | 'LN0'>
	dataPath: readonly string[]
}

export type MappedDataAndDefault = {
	/** `undefined` when nothing implements the record. */
	mappedData?: MappedData
	/** `undefined` when the record has no name or no `LNode` above it. */
	defaultData?: MappedDataDefaultRef
}

/** What a loop over data passes: the LNodes it already resolved at once, read instead of one lookup per data. */
export type ResolveMappedDataAndDefaultParams = ResolveMappedDataParams & {
	mappedLNodes?: MappedLNodes
}
