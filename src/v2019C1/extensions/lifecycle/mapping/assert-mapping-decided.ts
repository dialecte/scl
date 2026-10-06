import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { ResolvedMapping, ResolvedMappings, StoredRef } from './mapping.types'
import type { Scl } from '@/v2019C1/config'

/**
 * Refuse to write while where a shared element lands is the consumer's to choose: several
 * elements of the project qualify, and neither picking one nor creating another is the engine's
 * call.
 */
export function assertMappingDecided(params: {
	sourceRef: StoredRef
	resolved: ResolvedMapping
}): void {
	const { sourceRef, resolved } = params

	invariant(!resolved.undecided, {
		key: SCL_ERRORS.MAPPING_UNDECIDED,
		meta: { sourceId: sourceRef.id, tagName: sourceRef.tagName, kind: 'shared' },
		detail: `where the <${sourceRef.tagName}> "${sourceRef.id}" of the template lands is not decided: several elements of the project qualify, choose one or have a new one created`,
	})
}

/** {@link assertMappingDecided} for every shared element carried with a source primary. */
export function assertMappingsDecided(params: {
	satelliteRefs: readonly Scl.Ref<Scl.ElementsOf>[]
	resolvedMappings: ResolvedMappings
}): void {
	const { satelliteRefs, resolvedMappings } = params

	for (const satelliteRef of satelliteRefs) {
		const satelliteId = satelliteRef.id
		const resolved = satelliteId ? resolvedMappings.get(satelliteId) : undefined
		if (!satelliteId || !resolved) continue
		assertMappingDecided({ sourceRef: { ...satelliteRef, id: satelliteId }, resolved })
	}
}
