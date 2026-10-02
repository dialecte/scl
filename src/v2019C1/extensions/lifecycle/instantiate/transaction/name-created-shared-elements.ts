import { resolvePlacementCollision } from '@/v2019C1/extensions/lifecycle/constraints'
import { findMappingPolicy } from '@/v2019C1/extensions/lifecycle/mapping'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { NameCreatedSharedElementsParams } from './name-created-shared-elements.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Name the shared elements an operation CREATED (those with no project element to map onto): each
 * is validated against the structural level it landed on — the name the consumer chose is
 * applied, and a name already taken there is bumped to a free one, like any placed element.
 */
export async function nameCreatedSharedElements(
	tx: Core.Transaction<Config>,
	params: NameCreatedSharedElementsParams,
): Promise<void> {
	const { sourceQuery, cloneMappings, structure, decisionMappings } = params

	for (const mapping of cloneMappings) {
		if (!mapping.source.id || !findMappingPolicy(mapping.source.tagName)) continue

		const sourceRef = {
			tagName: mapping.source.tagName,
			id: mapping.source.id,
		} as Scl.Ref<Scl.ElementsOf>
		const parentRef = await resolveStructureRef(sourceQuery, sourceRef, structure)
		const decision = decisionMappings?.get(mapping.source.id)
		const chosenName = decision && 'create' in decision ? decision.create.name : undefined
		await resolvePlacementCollision(tx, {
			ref: mapping.target,
			parentRef,
			overrides: chosenName ? { name: chosenName } : undefined,
		})
	}
}
