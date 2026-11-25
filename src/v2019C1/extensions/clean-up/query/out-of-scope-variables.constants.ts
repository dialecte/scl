import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { PATH_PAIRS_BY_TAG } from '@/v2019C1/hooks/shared/path-references.constants'

import type { ReferencePair } from '@/v2019C1/extensions/reference'

/** The behaviour variable tags and their behaviour pairs, read from the registry. */
export const BEHAVIOUR_PAIRS_BY_TAG: ReadonlyMap<string, readonly ReferencePair[]> = new Map(
	[...PATH_PAIRS_BY_TAG].flatMap(([tagName, pairs]): [string, readonly ReferencePair[]][] => {
		const behaviour = pairs.filter(
			(pair) => pair.resolution === RESOLUTION_TYPE.behaviorDescription,
		)
		return behaviour.length > 0 ? [[tagName, behaviour]] : []
	}),
)
