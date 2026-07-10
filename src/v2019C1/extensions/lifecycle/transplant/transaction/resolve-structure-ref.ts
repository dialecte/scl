import { invariant } from '@dialecte/core/utils'

import type { ResolveTargetParent } from './primitives/clone-referenced'
import type { TargetStructure } from './structure.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Finds the nearest Substation/VoltageLevel/Bay ancestor of a source-side ref
 * and returns the matching target-side structural ref from the target structure.
 */
export async function resolveStructureRef(
	sourceQuery: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
	structure: TargetStructure,
): Promise<Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>> {
	const ancestors = await sourceQuery.findAncestors(ref, { stopAtTagName: 'Substation' })

	const match = ancestors.find((record) => record.tagName in structure)
	invariant(match, {
		key: 'ELEMENT_NOT_FOUND',
		detail: `No Substation/VoltageLevel/Bay level in the target structure for ${ref.tagName}`,
	})

	const target = structure[match.tagName as keyof TargetStructure]
	invariant(target, {
		key: 'ELEMENT_NOT_FOUND',
		detail: `Target structure missing the ${match.tagName} level for ${ref.tagName}`,
	})
	return { tagName: target.tagName, id: target.id } as
		| Scl.Ref<'Substation'>
		| Scl.Ref<'VoltageLevel'>
		| Scl.Ref<'Bay'>
}

/**
 * Builds a {@link ResolveTargetParent} that places each satellite by **mirroring
 * the source ancestor chain** into the target.
 *
 * The returned resolver walks the source ancestors nearest-first and returns the
 * first that already exists in the target: a previously-cloned `Function`/`SubFunction`
 * (via `cloneIndex`, keyed by source record id) takes precedence over the structural
 * `Substation`/`VoltageLevel`/`Bay` levels — so a `ProcessResource` that lives under a
 * `Function` is cloned back under that function's clone, not flat at `Substation`.
 */
export function createAncestryResolver(context: {
	sourceQuery: Core.Query<Config>
	structure: TargetStructure
	cloneIndex: ReadonlyMap<string, Scl.Ref<Scl.ElementsOf>>
}): ResolveTargetParent {
	const { sourceQuery, structure, cloneIndex } = context

	return async function (ref) {
		const ancestors = await sourceQuery.findAncestors(ref, { stopAtTagName: 'Substation' })

		for (const ancestor of ancestors) {
			const cloned = cloneIndex.get(ancestor.id)
			if (cloned) return cloned

			if (ancestor.tagName in structure) {
				const target = structure[ancestor.tagName as keyof TargetStructure]
				if (target) return { tagName: target.tagName, id: target.id }
			}
		}

		invariant(false, {
			key: 'ELEMENT_NOT_FOUND',
			detail: `No clone-mapped or structural ancestor found for ${ref.tagName}`,
		})
	}
}
