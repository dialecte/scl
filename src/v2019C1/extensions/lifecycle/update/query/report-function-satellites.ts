import { findInstanceByTemplateUuid } from '../find-instance'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { resolveCarriedSatellites } from '@/v2019C1/extensions/lifecycle/engine/satellites'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Fold each carried satellite's changes into the function's decision group as
 * read-only COMPANIONS (ENGINE.md §16, G6). A satellite (e.g. a
 * `FunctionCategory`) lives OUTSIDE the function subtree, so the primary diff
 * never saw it; here it is diffed on its own (matched globally by
 * `templateUuid`) and its changed root is attached to the function's group.
 *
 * v1 scope: only when the function itself is a changed primary. An existing
 * instance satellite -> its change; no instance yet -> the update ADDS it (an
 * all-added companion). No satellite deletion; a satellite-only change with an
 * unchanged function, and SubFunction-carried satellites, are deferred.
 */
export async function foldCarriedSatellites(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		report: DiffReport
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, report } = params

	const group = report.groups.find(
		(candidate) => candidate.primary.sourceRef?.id === functionRef.id,
	)
	if (!group) return report

	const satellites = await resolveCarriedSatellites(sourceQuery, { primaryRef: functionRef })
	for (const satelliteRef of satellites) {
		const { uuid: sourceUuid } = await sourceQuery.any.getAttributes(satelliteRef)
		const instance = await findInstanceByTemplateUuid(query, {
			tagName: satelliteRef.tagName,
			sourceUuid,
		})

		// no instance yet -> a newly-classified satellite the update adds (all-added subtree)
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
