import { toRef } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import type { PlacementLevel } from './resolve-placement-mappings.types'
import type { Scl } from '@/v2019C1/config'

/**
 * The deepest element of the project on the chain a level lands on: the level itself when it is
 * mapped onto one, else the nearest level above it that is.
 */
export function findLanding(params: {
	placementLevels: readonly PlacementLevel[]
	/** Record id of the source level the chain is walked up from. */
	levelId: string
}): Scl.Ref<Scl.ElementsOf> | undefined {
	const { placementLevels } = params

	let levelId: string | undefined = params.levelId
	while (levelId) {
		const level = placementLevels.find((candidate) => candidate.sourceRef.id === levelId)
		if (!level) return undefined
		if (level.resolved.existing) return toRef(level.resolved.existing) as Scl.Ref<Scl.ElementsOf>
		levelId = level.parentSourceId
	}
	return undefined
}

/** Refuse to place anything while a level is the consumer's to choose. */
export function assertPlacementDecided(params: {
	placementLevels: readonly PlacementLevel[]
	/** The operation refusing, for the message. */
	operation: string
}): void {
	const { placementLevels, operation } = params

	const undecided = placementLevels.find((level) => level.undecided && level.resolved.ambiguous)
	invariant(!undecided, {
		detail: `${operation}: where the <${undecided?.sourceRef.tagName}> of the template lands is not decided: several elements of the project qualify, choose one or have a new one created`,
	})
}
