import type { EnsureTopologyFrameResult } from './ensure-topology-frame.types'
import type { ResolvePrimaryPlacementParams } from './resolve-primary-placement.types'

export type LandPrimariesParams = ResolvePrimaryPlacementParams & {
	/** The operation placing them, for the message of a refusal. */
	operation: string
}

/** The levels the primaries of a template land on, once resolved and created where missing. */
export type PrimaryLanding = EnsureTopologyFrameResult & {
	/** Record id of the deepest source level a primary sits at. */
	deepestLevelId: string
}
