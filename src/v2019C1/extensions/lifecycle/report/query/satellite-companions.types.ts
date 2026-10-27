import type { Config, Scl } from '@/v2019C1/config'
import type { BoundLogicalNodeTypes } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type { MatchKey, NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/** What the comparison of one source satellite with the element of the project it lands on reads. */
export type SatelliteDiffParams = {
	sourceQuery: Core.Query<Config>
	satelliteRef: Scl.Ref<Scl.ElementsOf>
	/** The element of the project it lands on; none when it is new. */
	instance: AnyTrackedRecord | undefined
	/** That element is the project's own: only what the source contributes below it is compared. */
	projectOwned: boolean
	matchKey: MatchKey
	/** What its references may name: what the placement places or the instance holds. */
	scope: ContributionScope
	/** The source elements the instance's selection of functional variants leaves out. */
	notSelected?: ReadonlySet<string>
	/** What belongs to the other instances of the template the satellite is folded for. */
	resolveForeignScope?: ResolveForeignScope
	/** A fresh placement's references are its own. */
	removalBase: RemovalBase
	boundLogicalNodeTypes?: BoundLogicalNodeTypes
	placeholderLineages?: PlaceholderLineages
	namesFollow: NamesFollow
}
