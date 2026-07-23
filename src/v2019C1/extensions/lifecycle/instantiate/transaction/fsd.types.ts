import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
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
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
}

export type FsdResult = {
	/**
	 * The instantiated root in the target. Tag is `SubFunction` when the function
	 * was placed under a (Sub)Function (retagged), otherwise `Function`.
	 */
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
	/** Full source-record -> target-record mapping for the cloned subtree. */
	recordMappings: Scl.CloneMapping[]
}
