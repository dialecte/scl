import type { Config, Scl } from '@/v2019C1/config'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

export type FindDroppedComposedFunctionsParams = {
	sourceQuery: Core.Query<Config>
	/** The application of the newer template, or revision. */
	applicationRef: Scl.Ref<'Application'>
	/** The instances of it the update goes through: what one of them composes stays while another still does. */
	instances: readonly AnyRefOrRecord[]
	/** The scenario's key a function of the project carries its source function's uuid in. */
	matchKey: MatchKey
	/** What tells a function the source dropped from one the project added: see `classifyUnmatched`. */
	removalBase: RemovalBase
	/**
	 * The functions the update reconciles as standalone ones beside the application (a substation scope's, see
	 * `resolveTopologyReconcilables`): one the application no longer composes is updated as such, never dropped. Absent:
	 * an application updated on its own.
	 */
	standaloneFunctions?: readonly Scl.Ref<'Function'>[]
}

/** Functions of the revision. */
export type UuidsOfParams = {
	refs: readonly Scl.Ref<'Function'>[]
}
