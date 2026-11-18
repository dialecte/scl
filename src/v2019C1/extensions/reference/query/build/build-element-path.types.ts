import type { ElementPath } from './path-segment.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type BuildElementPathsParams = {
	/** The elements to answer, as refs or as records read; one may be given several times. */
	refs: readonly Core.RefOrRecord<Config, Scl.ElementsOf>[]
}

/**
 * The path of each element given, in input order; `null` for a ref naming nothing or an element with no segment of
 * its own.
 */
export type BuildElementPathsResult = (ElementPath | null)[]
