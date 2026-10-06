import type { Config, Scl } from '@/v2019C1/config'
import type { HeldLevels } from '@/v2019C1/extensions/lifecycle/layers/topology'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

export type ResolveInstanceHoldingsParams = {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	/** The instance of the application, in the project. */
	instance: AnyTrackedRecord
	functionRefs: readonly Scl.Ref<'Function'>[]
	/** Every function of the project carrying the lineage of a source function, by its record id. */
	heldFunctions: ReadonlyMap<string, readonly AnyTrackedRecord[]>
}

/** What one instance of the application holds of the functions its template composes. */
export type InstanceHoldings = {
	/** The functions of the instance, by the record id of the source function. */
	ownedFunctions: Map<string, AnyTrackedRecord[]>
	/** Where the instance lives, level by level. */
	heldLevels: HeldLevels
}
