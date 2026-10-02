import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** An element of the template and the element of the project that stands for it in one instance. */
export type InstanceCounterpart = {
	source: Scl.Ref<Scl.ElementsOf>
	instance: Scl.Ref<Scl.ElementsOf>
}

export type ResolveHeldLevelsParams = {
	sourceQuery: Core.Query<Config>
	/** What the instance holds of the template, the most telling first. */
	counterparts: readonly InstanceCounterpart[]
}

/**
 * The level of the project that stands for a level of the template, for one instance — by the
 * record id of the source level.
 */
export type HeldLevels = ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>

export type FindHeldLevelParams = {
	/** The element of the template to find the level of. */
	sourceRef: Scl.Ref<Scl.ElementsOf>
	heldLevels: HeldLevels
}
