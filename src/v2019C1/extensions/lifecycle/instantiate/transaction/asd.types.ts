import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type * as Core from '@dialecte/core'

export type AsdParams = {
	sourceQuery: Core.Query<Config>
	/** The Application carried by the ASD to instantiate. */
	applicationRef: Scl.Ref<'Application'>
	/** Target parent the application content is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** User-edited values per source element id (full track); drives collision override. */
	overrides?: CollisionOverrides
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
	/** The consumer's choices for the shared elements the application refers to. */
	decisionMappings?: DecisionMappings
	/**
	 * The application is placed by this operation alone (an ASD): `targetParent` is where the
	 * consumer started, and started above a level the application or one of its functions was made
	 * for, each lands on the level its template says. Left out when the caller already resolved
	 * where they land.
	 */
	resolvePlacement?: boolean
}

export type AsdResult = {
	/** The instantiated Application in the target. */
	applicationRef: Scl.Ref<'Application'>
	/** The instantiated composed Function roots (referenced by the Application). */
	composedFunctionRefs: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]
	/**
	 * Each source record and the copy made of it, for everything the operation cloned: the
	 * Application, its composed Functions, their categories, the shared elements created for it and
	 * the cross-cutting satellites that live outside the Application subtree.
	 */
	cloneMappings: Scl.CloneMapping[]
}
