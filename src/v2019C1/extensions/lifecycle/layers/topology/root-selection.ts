import { TEMPLATE_NAME, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'

/**
 * Resolve the instantiable root of a process section.
 *
 * Descends `Substation -> VoltageLevel -> Bay` through `TEMPLATE`-named levels and returns the
 * FIRST element whose `name` is not `TEMPLATE` - the reusable unit to instantiate. If every level
 * down the chain is `TEMPLATE` (or the chain ends), the deepest reached element is the root.
 *
 * Returns `undefined` when the document has no `Substation`.
 */
export async function resolveInstantiableRoot(
	query: Core.Query<Config>,
): Promise<Scl.Ref<TopologyStructuralTag> | undefined> {
	const [substation] = await query.getRecordsByTagName('Substation')
	if (!substation) return undefined

	let current: { tagName: string; id: string } = { tagName: 'Substation', id: substation.id }
	let depth = 0

	while (true) {
		const ref = { tagName: current.tagName, id: current.id } as Scl.Ref<Scl.ElementsOf>
		const name = (await query.getAttribute(ref, { name: 'name' })) as string | undefined
		if (name !== TEMPLATE_NAME) break // first named level = the instantiable unit

		const nextTag = TOPOLOGY_STRUCTURAL_TAGS[depth + 1]
		if (!nextTag) break // reached the deepest chain level (Bay) - it is the root

		const [child] = await query.any.getChildren(ref, nextTag)
		if (!child) break // no deeper level - current is the root

		current = { tagName: nextTag, id: child.id }
		depth += 1
	}

	return { tagName: current.tagName as TopologyStructuralTag, id: current.id }
}
