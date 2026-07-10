import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type FsdParams = {
	sourceQuery: Core.Query<Config>
	/** The Function (or SubFunction) carried by the FSD to instantiate. */
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
	/** Target parent the function is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
}
