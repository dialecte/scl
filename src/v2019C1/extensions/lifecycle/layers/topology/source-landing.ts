import { findLanding } from './placement-landing'

import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { LandingOf, LevelLandings } from './source-landing.types'
import type { Scl } from '@/v2019C1/config'

/** Where each decided level lands what it holds, by its source record id: the element its row (or the nearest above) maps onto. */
export function resolveLevelLandings(params: {
	placementLevels: readonly PlacementLevel[]
}): LevelLandings {
	const { placementLevels } = params
	const landings = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const level of placementLevels) {
		const landing = findLanding({ placementLevels, levelId: level.sourceRef.id })
		if (landing) landings.set(level.sourceRef.id, landing)
	}
	return landings
}

/**
 * The one answer every part of a placement by source levels reads for where an element lands — a primary, a satellite
 * held by a level, the reach of what it names: the landing of its nearest ancestor that is a level row. Pure.
 */
export function createLandingOf(params: { landings: LevelLandings }): LandingOf {
	const { landings } = params
	return function landingOf(ancestors) {
		for (const ancestor of ancestors) {
			const landing = landings.get(ancestor.id)
			if (landing) return landing
		}
		return undefined
	}
}
