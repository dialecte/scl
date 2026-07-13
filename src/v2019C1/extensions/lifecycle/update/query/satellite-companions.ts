import { findInstanceByTemplateUuid } from '../find-instance'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Fold each satellite's changes into the primary's decision group as read-only
 * COMPANIONS (ENGINE.md §16, G6). Generic over the layer: the caller resolves the
 * satellite refs (reverse-ref for the function's FunctionCategory, outward-ref for
 * the application's AllocationRole). Each satellite is matched globally by
 * `templateUuid`; a not-yet-instantiated one surfaces as an all-added companion.
 * Folds only when the primary itself is a changed group (satellite-only change
 * with an unchanged primary is deferred).
 */
export async function foldSatelliteCompanions(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		satelliteRefs: Scl.Ref<Scl.ElementsOf>[]
		report: DiffReport
	},
): Promise<DiffReport> {
	const { sourceQuery, primaryRef, satelliteRefs, report } = params

	const group = report.groups.find((candidate) => candidate.primary.sourceRef?.id === primaryRef.id)
	if (!group) return report

	for (const satelliteRef of satelliteRefs) {
		const { uuid: sourceUuid } = await sourceQuery.any.getAttributes(satelliteRef)
		const instance = await findInstanceByTemplateUuid(query, {
			tagName: satelliteRef.tagName,
			sourceUuid,
		})
		const satelliteReport = await diff({
			sourceQuery,
			targetQuery: query,
			sourceRootRef: satelliteRef,
			instanceRootRef: instance,
		})
		if (satelliteReport.root.change !== 'unchanged') group.companions.push(satelliteReport.root)
	}
	return report
}
