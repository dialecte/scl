import { ensureTopologyFrame } from './ensure-topology-frame'
import { assertPlacementDecided } from './placement-landing'
import { resolvePrimaryPlacement } from './resolve-primary-placement'

import type { LandPrimariesParams, PrimaryLanding } from './land-primaries.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Resolve, and prepare, where the primaries of a function or application template land. Started
 * at or below the level they were made for, they land where the consumer started: nothing is
 * prepared. Started above it, each level of the template is resolved
 * ({@link resolvePrimaryPlacement}) and the levels the project lacks are created, so the caller
 * places each primary on the level its template says (`frameIndex`).
 */
export async function landPrimaries(
	tx: Core.Transaction<Config>,
	params: LandPrimariesParams,
): Promise<PrimaryLanding | undefined> {
	const { sourceQuery, primaryRefs, anchor, decisionMappings, operation } = params

	const placement = await resolvePrimaryPlacement(tx, {
		sourceQuery,
		primaryRefs,
		anchor,
		decisionMappings,
	})
	const deepestLevel = placement.levels.at(-1)
	if (!deepestLevel) return undefined

	assertPlacementDecided({ placementLevels: placement.levels, operation })
	const frame = await ensureTopologyFrame(tx, {
		sourceQuery,
		scopeRef: deepestLevel.sourceRef,
		targetParent: anchor,
		placementLevels: placement.levels,
	})
	return {
		structure: frame.structure,
		frameIndex: frame.frameIndex,
		deepestLevelId: deepestLevel.sourceRef.id,
		cloneMappings: frame.cloneMappings,
		redirectMappings: frame.redirectMappings,
	}
}
