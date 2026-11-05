import {
	resolveSatelliteMappings,
	resolveSatelliteRemovals,
	toRedirectMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'

import type { LinkedSectionReading, ReadLinkedSectionsParams } from './description.types'
import type { MappingReader } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

/**
 * Read where linked elements land and what the instance loses, before any primary writes. Discovery, placement and
 * identity stay with the caller; undecided mappings remain visible for reporting and are checked by the write path.
 */
export async function readLinkedSections(
	query: MappingReader,
	params: ReadLinkedSectionsParams,
): Promise<LinkedSectionReading> {
	const { sourceQuery, description, instancePrimaryRef } = params
	const { satelliteRefs, instanceSatelliteRefs = [] } = description
	const matchKey = params.matchKey ?? 'templateUuid'
	const resolvedMappings = await resolveSatelliteMappings(query, {
		sourceQuery,
		satelliteRefs,
		instanceSatelliteRefs,
		decisionMappings: params.decisionMappings,
		matchKey,
	})
	const removals = instancePrimaryRef
		? await resolveSatelliteRemovals(query, {
				sourceQuery,
				instancePrimaryRef,
				instanceSatelliteRefs,
				resolvedMappings,
				removalBase: params.removalBase,
				matchKey,
			})
		: []
	const redirectMappings = await toRedirectMappings({
		sourceQuery,
		satelliteRefs,
		resolvedMappings,
	})
	return { ...description, resolvedMappings, removals, redirectMappings }
}
