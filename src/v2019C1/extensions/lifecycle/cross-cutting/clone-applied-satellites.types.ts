import type { Config, Scl } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'

export type CloneAppliedSatellitesParams = {
	sourceQuery: Core.Query<Config>
	primaryRef: Scl.Ref<Scl.ElementsOf>
	structure: TargetStructure
	strip?: boolean
	/** The source elements the consumer left out (record ids): a satellite applying to them only is not placed. */
	leftOut?: ReadonlySet<string>
	/** The key a project element carries a source element's uuid in, to find what it lands on. Default `templateUuid`. */
	matchKey?: MatchKey
}

export type CloneAppliedSatellitesResult = {
	/** Each source record that was cloned and the copy made of it. */
	cloneMappings: Scl.CloneMapping[]
	/** The satellites (and their named containers) that landed on one the target already holds. */
	redirectMappings: RedirectMapping[]
}
