import {
	assertPlacementDecided,
	readSourceLevels,
	createLandingOf,
	resolveLevelLandings,
	resolvePrimaryPlacement,
} from '@/v2019C1/extensions/lifecycle/layers/topology'

import type { CopyLanding, ResolveCopyLandingParams } from './copy.types'
import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'

/**
 * Where a copy lands what it copies, read before anything is written, as its report lists it: the levels its functions
 * sit on in the source, each placing what it holds where its row says (`resolvePrimaryPlacement` with `levels:
 * 'source'`), the copied root under the anchor. Nothing is placed while a row waits on the consumer
 * (`MAPPING_UNDECIDED`).
 */
export async function resolveCopyLanding(
	tx: ResolveCopyLandingParams['tx'],
	params: Omit<ResolveCopyLandingParams, 'tx'>,
): Promise<CopyLanding> {
	const { sourceQuery, functionRefs, anchor, decisionMappings, operation } = params
	// the levels the functions sit on, read once: the rows, and the level each function lands by
	const sourceLevels = await readSourceLevels({ sourceQuery, primaryRefs: functionRefs })
	const { levels } = await resolvePrimaryPlacement(tx, {
		sourceQuery,
		primaryRefs: functionRefs,
		anchor,
		decisionMappings,
		levels: 'source',
		sourceLevels,
	})
	assertPlacementDecided({ placementLevels: levels, operation })
	const landings = resolveLevelLandings({ placementLevels: levels })
	const landingOf = createLandingOf({ landings })
	// a level lands what it holds on a Substation, a VoltageLevel or a Bay: what admits a function
	const functionLandings = new Map<string, Scl.Ref<TopologyStructuralTag>>()
	for (const { sourceRef, primaryIds } of sourceLevels) {
		const landing = landings.get(sourceRef.id)
		if (!landing) continue
		for (const functionId of primaryIds) {
			functionLandings.set(functionId, landing as Scl.Ref<TopologyStructuralTag>)
		}
	}
	return { placeUnder: anchor, landingOf, functionLandings }
}
