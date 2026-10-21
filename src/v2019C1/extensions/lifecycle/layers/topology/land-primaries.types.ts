import type { EnsureTopologyFrameResult } from './ensure-topology-frame.types'
import type { ResolvePrimaryPlacementParams } from './resolve-primary-placement.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'

export type LandPrimariesParams = ResolvePrimaryPlacementParams & {
	/** The operation placing them, for the message of a refusal. */
	operation: string
	/** The key a project element carries a source element's uuid in, to find what it lands on. Default `templateUuid`. */
	matchKey?: MatchKey
}

/** The levels the primaries of a template land on, once resolved and created where missing. */
export type PrimaryLanding = EnsureTopologyFrameResult & {
	/** Record id of the deepest source level a primary sits at. */
	deepestLevelId: string
}
