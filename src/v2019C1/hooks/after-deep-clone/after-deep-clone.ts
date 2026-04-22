import { remapClonedRefPaths } from './ref-paths'

import type { Scl } from '@/v2019C1/config'

/**
 * After deepClone completes, re-sweep all cloned REF elements:
 *  1. Remap their UUID reference attrs (source uuid -> new clone uuid).
 *  2. Recompute their path attrs from the now-visible cloned target elements.
 *
 * Fixes ordering issues where a REF element was staged before its target
 * during a single deepClone pass, so afterCreated could not resolve the path.
 */
export async function afterDeepClone(params: {
	cumulativeCloneMappings: Scl.CloneMapping[]
	query: Scl.Query
}): Promise<Scl.Operation[]> {
	return remapClonedRefPaths(params)
}
