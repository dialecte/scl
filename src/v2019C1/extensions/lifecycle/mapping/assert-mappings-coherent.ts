import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type { DecisionMappings, ReportMapping } from './mapping.types'

/**
 * Reject a set of mapping choices the report cannot honour. Runs on the report (the choices it
 * was derived from) and before any write.
 */
export function assertMappingsCoherent(params: {
	reportMappings: readonly ReportMapping[]
	decisionMappings: DecisionMappings
}): void {
	const { reportMappings, decisionMappings } = params

	for (const [sourceId, decision] of decisionMappings) {
		const mapping = reportMappings.find((reported) => reported.id === sourceId)
		invariant(mapping, {
			key: SCL_ERRORS.MAPPING_CHOICE_UNKNOWN,
			detail: `mapping choice for "${sourceId}": the report lists no shared element "${sourceId}"`,
			meta: { sourceId },
		})
		const { tagName } = mapping

		invariant(mapping.selectable, {
			key: SCL_ERRORS.MAPPING_CHOICE_NOT_SELECTABLE,
			detail: `mapping choice for "${sourceId}": the mapping of <${tagName}> cannot be chosen`,
			meta: { sourceId, tagName },
		})

		invariant(!mapping.locked, {
			key: SCL_ERRORS.MAPPING_CHOICE_LOCKED,
			detail: `mapping choice for "${sourceId}": the instance already carries the mapping of this <${tagName}>`,
			meta: { sourceId, tagName },
		})

		if (!('existing' in decision)) continue
		const chosen = decision.existing
		const isCandidate = mapping.candidates.some(
			(candidate) => candidate.ref.tagName === chosen.tagName && candidate.ref.id === chosen.id,
		)
		invariant(isCandidate, {
			key: SCL_ERRORS.MAPPING_CHOICE_NOT_A_CANDIDATE,
			detail: `mapping choice for "${sourceId}": <${chosen.tagName}> "${chosen.id}" is not a candidate`,
			meta: { sourceId, tagName, chosen: { tagName: chosen.tagName, id: chosen.id } },
		})
	}
}
