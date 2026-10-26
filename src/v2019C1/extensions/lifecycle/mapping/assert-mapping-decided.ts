import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type {
	DecisionMappings,
	ReportMapping,
	ResolvedMapping,
	ResolvedMappings,
	StoredRef,
} from './mapping.types'
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

/**
 * Refuse, before anything is written, a report holding a mapping left to the consumer that it did not choose: one the
 * report leaves without `mapping`, not chosen, and whose `dependsOn` chain reaches no chosen mapping (a level whose
 * place follows from where the level above lands is decided by that choice). A mapping decided for one element of the
 * project (`placedFor`) is left alone when nothing is written for that element (every group of it skipped).
 */
export function assertReportMappingsDecided(params: {
	reportMappings: readonly ReportMapping[]
	decisionMappings: DecisionMappings | undefined
	/** The record ids of the project elements an accepted group writes for. */
	writtenFor: ReadonlySet<string>
}): void {
	const { reportMappings, decisionMappings, writtenFor } = params
	const byId = new Map(reportMappings.map((reported) => [reported.id, reported]))
	for (const reported of reportMappings) {
		if (reported.mapping) continue
		const placedFor = reported.placedFor?.id
		if (placedFor && !writtenFor.has(placedFor)) continue
		invariant(followsChoice({ reported, byId, decisionMappings }), {
			key: SCL_ERRORS.MAPPING_UNDECIDED,
			meta: {
				sourceId: reported.sourceId ?? reported.id,
				tagName: reported.tagName,
				kind: reported.kind,
			},
			detail: `where the <${reported.tagName}> "${reported.id}" of the template lands is not decided: choose it before applying`,
		})
	}
}

/** Whether a mapping, or one of the mappings its `dependsOn` chain reaches, is chosen by the consumer. */
function followsChoice(params: {
	reported: ReportMapping
	byId: ReadonlyMap<string, ReportMapping>
	decisionMappings: DecisionMappings | undefined
}): boolean {
	const { byId, decisionMappings } = params
	let current: ReportMapping | undefined = params.reported
	const seen = new Set<string>()
	while (current && !seen.has(current.id)) {
		if (decisionMappings?.has(current.id)) return true
		seen.add(current.id)
		current = current.dependsOn ? byId.get(current.dependsOn) : undefined
	}
	return false
}
