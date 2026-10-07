import { findInstancesByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'

import type { PrimaryParents, ResolvePrimaryParentsParams } from './resolve-primary-parents.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The elements of the project a primary of the scope is updated under, and whether the template
 * gained it (no instance of it yet).
 *
 * A primary the project already holds an instance of is reconciled where its instances are: under
 * the element the consumer started from. A primary the template GAINED has none: it is placed once
 * per instance of the unit, on the level that instance holds for the level the primary sits on in
 * the template — in the bay the instance lives in, not under the element the update was started
 * from. With no instance of the unit to tell, it falls back on that element.
 */
export async function resolvePrimaryParents(
	query: Core.Query<Config>,
	params: ResolvePrimaryParentsParams,
): Promise<PrimaryParents> {
	const { sourceQuery, primaryRef, anchor, instanceLevelsList, matchKey } = params

	const sourceUuid = await sourceQuery.any.getAttribute(primaryRef, { name: 'uuid' })
	const held = await findInstancesByTemplateUuid(query, {
		tagName: primaryRef.tagName,
		sourceUuid,
		matchKey,
	})
	if (held.length > 0) return { parents: [anchor], gained: false }

	const sourceAncestors = await sourceQuery.findAncestors(primaryRef, {
		stopAtTagName: 'Substation',
	})
	const instanceParents: Scl.Ref<Scl.ElementsOf>[] = []
	for (const instanceLevels of instanceLevelsList) {
		const sourceLevel = sourceAncestors.find((ancestor) => instanceLevels.has(ancestor.id))
		const level = sourceLevel && instanceLevels.get(sourceLevel.id)
		if (level) instanceParents.push(level)
	}
	return { parents: instanceParents.length > 0 ? instanceParents : [anchor], gained: true }
}
