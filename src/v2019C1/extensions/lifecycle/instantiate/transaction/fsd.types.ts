import type { Scl, Config } from '@/v2019C1/config'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type * as Core from '@dialecte/core'

export type FsdParams = {
	sourceQuery: Core.Query<Config>
	/** The Function (or SubFunction) carried by the FSD to instantiate. */
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
	/** Target parent the function is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** User-edited values per source element id (full track); drives collision override. */
	overrides?: CollisionOverrides
}
