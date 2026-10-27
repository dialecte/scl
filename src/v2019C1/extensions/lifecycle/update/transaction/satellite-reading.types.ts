import type { Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { ResolvedMappings, SatelliteRemoval } from '@/v2019C1/extensions/lifecycle/mapping'

/**
 * What an update reads of the satellites of one instance before it writes anything, as the report read it: the
 * source satellites, where each lands, what goes of those the template no longer brings anything for, and what their
 * references may name.
 */
export type SatelliteReading = {
	satelliteRefs: Scl.Ref<Scl.ElementsOf>[]
	resolvedMappings: ResolvedMappings
	removals: readonly SatelliteRemoval[]
	/** What the satellites' references may name: what the instance holds or the update brings. */
	scope: ContributionScope
}
