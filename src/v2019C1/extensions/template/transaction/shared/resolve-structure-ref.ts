import { invariant } from '@dialecte/core/utils'

import type { TemplateStructure } from './template.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Finds the nearest Substation/VoltageLevel/Bay ancestor of a source-side ref
 * and returns the matching target-side structural ref from the template structure.
 */
export async function resolveStructureRef(
	sourceQuery: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
	structure: TemplateStructure,
): Promise<Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>> {
	const ancestors = await sourceQuery.findAncestors(ref, { stopAtTagName: 'Substation' })

	const match = ancestors.find((record) => record.tagName in structure)
	invariant(match, {
		key: 'ELEMENT_NOT_FOUND',
		detail: `No Substation/VoltageLevel/Bay ancestor found for ${ref.tagName}`,
	})

	const target = structure[match.tagName as keyof TemplateStructure]
	return { tagName: target.tagName, id: target.id } as
		| Scl.Ref<'Substation'>
		| Scl.Ref<'VoltageLevel'>
		| Scl.Ref<'Bay'>
}
