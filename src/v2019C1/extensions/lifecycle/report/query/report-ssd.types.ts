import type { PlacementListing } from './placement-listing.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { BoundLogicalNodeTypes } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { MatchKey, NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'

/** What folding the satellites of a placed frame reads: see `foldFrameSatellites`. */
export type FoldFrameSatellitesParams = {
	sourceQuery: Core.Query<Config>
	/** The report of the frame the placement adds. */
	placedFrame: ReportInstance
	scopeRef: Scl.Ref<TopologyStructuralTag>
	/** Where the unit lands. */
	anchor: Scl.Ref<Scl.ElementsOf>
	matchKey: MatchKey
	removalBase: RemovalBase
	boundLogicalNodeTypes?: BoundLogicalNodeTypes
	placeholderLineages?: PlaceholderLineages
	namesFollow: NamesFollow
	/** The units of the scaffolding the scope leaves out (record ids). */
	leftOut: ReadonlySet<string>
	placementListing: PlacementListing
}
