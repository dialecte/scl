import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

export type FindFrameInstancesParams = {
	sourceQuery: Core.Query<Config>
	/** The unit of the template: the first named level. */
	scopeRef: Scl.Ref<Scl.ElementsOf>
	matchKey?: MatchKey
	/** Only the levels below this element of the project. */
	within?: Scl.Ref<Scl.ElementsOf>
}

/** A level of the project an instance of a template's unit sits on. */
export type FrameInstance = {
	instance: AnyTrackedRecord
	/**
	 * The level is the project's own, the unit was mapped onto it: it does not carry the unit's
	 * lineage and only receives what the template contributes below it.
	 */
	projectOwned: boolean
}
