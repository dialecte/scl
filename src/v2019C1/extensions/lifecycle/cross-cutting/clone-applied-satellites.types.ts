import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

export type CloneAppliedSatellitesParams = {
	sourceQuery: Core.Query<Config>
	primaryRef: Scl.Ref<Scl.ElementsOf>
	structure: TargetStructure
	/** The source elements the consumer left out (record ids): a satellite applying to them only is not placed. */
	leftOut?: ReadonlySet<string>
	/** A satellite placed beside a sibling of its name is numbered: the scenario tells placed elements apart. */
	bumpsCollisions: boolean
}

export type CloneAppliedSatellitesResult = {
	/** Each source record that was cloned and the copy made of it. */
	cloneMappings: Scl.CloneMapping[]
}
