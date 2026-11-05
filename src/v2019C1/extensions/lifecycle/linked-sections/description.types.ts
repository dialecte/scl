import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type {
	DecisionMappings,
	ResolvedMappings,
	SatelliteRemoval,
} from '@/v2019C1/extensions/lifecycle/mapping'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/** Linked elements discovered by their layer, and what their references may name. */
export type LinkedSectionDescription = {
	satelliteRefs: Scl.Ref<Scl.ElementsOf>[]
	instanceSatelliteRefs?: readonly Scl.Ref<Scl.ElementsOf>[]
	scope: ContributionScope
}

/** The mapping and retirement reading shared by report folding and update reconciliation. */
export type LinkedSectionReading = LinkedSectionDescription & {
	resolvedMappings: ResolvedMappings
	removals: readonly SatelliteRemoval[]
	redirectMappings: RedirectMapping[]
}

export type ReadLinkedSectionsParams = {
	sourceQuery: Core.Query<Config>
	description: LinkedSectionDescription
	instancePrimaryRef?: AnyRefOrRecord
	matchKey?: MatchKey
	removalBase: RemovalBase
	decisionMappings?: DecisionMappings
}
