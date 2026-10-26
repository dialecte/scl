import type { Scl } from '@/v2019C1/config'
import type { ResolvedMappings, SatelliteRemoval } from '@/v2019C1/extensions/lifecycle/mapping'

/**
 * What an update reads of the satellites of one instance before it writes anything, as the report read it: the
 * source satellites, where each lands, and what goes of those the template no longer brings anything for.
 */
export type SatelliteReading = {
	satelliteRefs: Scl.Ref<Scl.ElementsOf>[]
	resolvedMappings: ResolvedMappings
	removals: readonly SatelliteRemoval[]
}
