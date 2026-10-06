import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { SourceFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

export type FsdParams = {
	sourceQuery: Core.Query<Config>
	/** The function carried by the FSD to instantiate: a Function, a SubFunction or a FunctionTemplate. */
	functionRef: SourceFunctionRef
	/** Target parent the function is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** User-edited values per source element id (full track); drives collision override. */
	overrides?: CollisionOverrides
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
	/** The consumer's choices for the shared elements the function is classified by. */
	decisionMappings?: DecisionMappings
	/**
	 * The function is placed by this operation alone (an FSD): `targetParent` is where the consumer
	 * started, and started above the level the function was made for, it lands on the level its
	 * template says. Left out when the caller already resolved where it lands.
	 */
	resolvePlacement?: boolean
	/**
	 * The function is placed as part of a larger template (an application's, a substation's): the provenance is that
	 * template's, the function carries none of its own.
	 */
	partOfTemplate?: boolean
}

export type FsdResult = {
	/**
	 * The instantiated root in the target. Tag is `SubFunction` when the function
	 * was placed under a (Sub)Function (retagged), otherwise `Function`.
	 */
	functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
	/**
	 * Each source record and the copy made of it, for everything the operation cloned: the function
	 * subtree and the satellites carried with it (FunctionCategory, Variable, BehaviorDescription)
	 * that live outside the subtree.
	 */
	cloneMappings: Scl.CloneMapping[]
}
