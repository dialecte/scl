import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'

export type CloneAppliedSatellitesParams = {
	sourceQuery: Core.Query<Config>
	primaryRef: Scl.Ref<Scl.ElementsOf>
	/** What travels with the primary (the functions an application composes): what applies to them is placed too. */
	composedRefs?: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The source records the operation placed already (a satellite the application refers to, cloned with it). */
	alreadyCloned?: ReadonlySet<string>
	/**
	 * What it composes and does not place (record ids: a function stood on, another application placed it): nothing
	 * applying to it alone is placed, nor what it holds.
	 */
	notPlaced?: ReadonlySet<string>
	structure: TargetStructure
	/** The source elements the consumer left out (record ids): a satellite applying to them only is not placed. */
	leftOut?: ReadonlySet<string>
	/** A satellite placed beside a sibling of its name is numbered: the scenario tells placed elements apart. */
	bumpsCollisions: boolean
	/** What a satellite's references may name: what the placement places. */
	scope: ContributionScope
}

export type CloneAppliedSatellitesResult = {
	/** Each source record that was cloned and the copy made of it. */
	cloneMappings: Scl.CloneMapping[]
}
