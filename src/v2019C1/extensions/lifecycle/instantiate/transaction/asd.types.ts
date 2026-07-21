import type { Scl, Config } from '@/v2019C1/config'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type * as Core from '@dialecte/core'

export type AsdParams = {
	sourceQuery: Core.Query<Config>
	/** The Application carried by the ASD to instantiate. */
	applicationRef: Scl.Ref<'Application'>
	/** Target parent the application content is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** User-edited values per source element id (full track); drives collision override. */
	overrides?: CollisionOverrides
}

export type AsdResult = {
	/** The instantiated Application in the target. */
	applicationRef: Scl.Ref<'Application'>
	/** The instantiated composed Function roots (referenced by the Application). */
	composedFunctionRefs: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]
	/** Full source-record -> target-record mapping for the cloned content. */
	recordMappings: Scl.CloneMapping[]
}
