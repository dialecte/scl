import { findInstanceByTemplateUuid } from '../find-instance'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Fold each satellite's changes into the primary's decision group as read-only
 * COMPANIONS (ENGINE.md §16, G6). Generic over the layer: the caller resolves the
 * satellite refs from the SOURCE (reverse-ref for the function's FunctionCategory,
 * outward-ref for the application's AllocationRole) and, for removal detection, the
 * matching refs from the TARGET instance (`instanceSatelliteRefs`, resolved with the
 * same finder against the instance primary).
 *
 * Three companion kinds, all riding the primary's group (coupling invariant - never
 * independently decidable):
 *  - added / modified: a source satellite diffed against its instance (matched by
 *    `templateUuid`); a not-yet-instantiated one surfaces all-added;
 *  - removed: a TARGET instance satellite whose `templateUuid` the source no longer
 *    references -> folded as a `removed` companion so accepting the primary deletes it.
 *
 * Folds only when the primary itself is a changed group (satellite-only change with
 * an unchanged primary is deferred).
 */
export async function foldSatelliteCompanions(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		primaryRef: Scl.Ref<Scl.ElementsOf>
		satelliteRefs: Scl.Ref<Scl.ElementsOf>[]
		instanceSatelliteRefs?: Scl.Ref<Scl.ElementsOf>[]
		report: DiffReport
	},
): Promise<DiffReport> {
	const { sourceQuery, primaryRef, satelliteRefs, instanceSatelliteRefs, report } = params

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

	// removals: a target instance satellite whose template ELEMENT was removed from
	// the source. Catalog/shared satellites persist when merely un-referenced, so the
	// trigger is source-element non-existence, NOT a dropped link.
	for (const instanceRef of instanceSatelliteRefs ?? []) {
		const { templateUuid } = await query.any.getAttributes(instanceRef)
		if (!templateUuid) continue
		const [stillInSource] = await sourceQuery.any.findByAttributes({
			tagName: instanceRef.tagName,
			attributes: { uuid: templateUuid },
		})
		if (stillInSource) continue
		group.companions.push({
			change: 'removed',
			tagName: instanceRef.tagName,
			instanceRef,
			children: [],
		})
	}

	return report
}
