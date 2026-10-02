import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'

export type ResolvePrimaryPlacementParams = {
	sourceQuery: Core.Query<Config>
	/** The primaries of the template being placed: a function, or an application and its functions. */
	primaryRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The project element the consumer started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices, by source record id. */
	decisionMappings?: DecisionMappings
}

/** The consumer started above the level a template was made for: its content lands below. */
export type OffLevel = {
	/** The kind of level the template was made for. */
	templateLevel: string
	/** The kind of level the consumer started from. */
	startedFrom: string
}

/** Where the primaries of a template land, when it is not simply where the consumer started. */
export type PrimaryPlacement = {
	/**
	 * Where each level of the template lands — none when the consumer started at or below the level
	 * the template was made for: the primaries then land where the consumer started.
	 */
	levels: PlacementLevel[]
	offLevel?: OffLevel
}
