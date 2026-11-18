import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type ReadSpecNamingsParams = {
	/** The LNodes to answer, as refs or as records read; one may be given several times. */
	lnodes: readonly Core.RefOrRecord<Config, 'LNode'>[]
}

/** The `LNodeSpecNaming` of each LNode given, in input order; `undefined` for none or for a ref naming nothing. */
export type ReadSpecNamingsResult = (Scl.TrackedRecord<'LNodeSpecNaming'> | undefined)[]
