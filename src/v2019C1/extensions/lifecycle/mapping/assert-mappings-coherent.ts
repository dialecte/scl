import { invariant } from '@dialecte/core/utils'

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
			detail: `mapping choice for "${sourceId}": the report lists no shared element "${sourceId}"`,
		})

		invariant(mapping.selectable, {
			detail: `mapping choice for "${sourceId}": the mapping of <${mapping.tagName}> cannot be chosen`,
		})

		invariant(!mapping.locked, {
			detail: `mapping choice for "${sourceId}": the instance already carries the mapping of this <${mapping.tagName}>`,
		})

		if (!('existing' in decision)) continue
		const chosen = decision.existing
		const isCandidate = mapping.candidates.some(
			(candidate) => candidate.ref.tagName === chosen.tagName && candidate.ref.id === chosen.id,
		)
		invariant(isCandidate, {
			detail: `mapping choice for "${sourceId}": <${chosen.tagName}> "${chosen.id}" is not a candidate`,
		})
	}
}
