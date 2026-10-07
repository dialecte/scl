import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'

import type {
	PrimaryParents,
	PrimaryPlace,
	ResolvePrimaryParentsParams,
} from './resolve-primary-parents.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Where a primary of the scope is updated, and whether the template gained it (no instance of it
 * yet).
 *
 * A primary the project already holds an instance of is reconciled where its instances are: under
 * the element the consumer started from. A primary the template GAINED has none: it is placed once
 * per instance of the unit — for that instance (`placedFor`, the level it sits on), on the level the
 * instance holds for the level the primary sits on in the template, in the bay the instance lives
 * in, not under the element the update was started from. With no instance of the unit to tell, it
 * falls back on that element.
 */
export async function resolvePrimaryParents(
	query: Core.Query<Config>,
	params: ResolvePrimaryParentsParams,
): Promise<PrimaryParents> {
	const { sourceQuery, primaryRef, anchor, unitId, instanceLevelsList, matchKey } = params

	const sourceUuid = await sourceQuery.any.getAttribute(primaryRef, { name: 'uuid' })
	const held = await findInstancesByTemplateUuid(query, {
		tagName: primaryRef.tagName,
		sourceUuid,
		matchKey,
	})
	if (held.length > 0) return { places: [{ parent: anchor }], gained: false }

	const sourceAncestors = await sourceQuery.findAncestors(primaryRef, {
		stopAtTagName: 'Substation',
	})
	const places: PrimaryPlace[] = []
	for (const instanceLevels of instanceLevelsList) {
		const placedFor = instanceLevels.get(unitId)
		if (!placedFor) continue
		const sourceLevel = sourceAncestors.find((ancestor) => instanceLevels.has(ancestor.id))
		const parent = sourceLevel && instanceLevels.get(sourceLevel.id)
		places.push({ placedFor, ...(parent ? { parent } : {}) })
	}
	return { places: places.length > 0 ? places : [{ parent: anchor }], gained: true }
}
