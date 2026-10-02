import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionMappings,
	ResolvedMapping,
	StoredRef,
} from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'

export type ResolvePlacementMappingsParams = {
	sourceQuery: Core.Query<Config>
	/** The unit to instantiate: the first named level of the template. */
	scopeRef: Scl.Ref<Scl.ElementsOf>
	/** The project element the consumer started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices, by source record id. */
	decisionMappings?: DecisionMappings
}

/** Where one structural level of a template lands in the project. */
export type PlacementLevel = {
	sourceRef: StoredRef
	/** Record id of the template level above this one — none for the top level. */
	parentSourceId?: string
	/** The project element the level above lands on — none when that one is created. */
	parentTarget?: Scl.Ref<Scl.ElementsOf>
	/** A level above the unit to instantiate: the project's own context, which the template gives nothing to. */
	context: boolean
	resolved: ResolvedMapping
	/** The name the level is created under, when it is created. */
	createName?: string
	/**
	 * Nothing is decided for the level: several levels of the project qualify and the consumer has to
	 * choose, or the level above is itself not decided. Nothing can be placed until it is.
	 */
	undecided: boolean
}
