import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	collectChangedDescendants,
	groupChanges,
} from '@/v2019C1/extensions/lifecycle/engine/group'
import { findInstanceByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'

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
		/** Instance scope for a standalone satellite group (primary-unchanged case). */
		instanceScopeId?: string
	},
): Promise<DiffReport> {
	const { sourceQuery, primaryRef, satelliteRefs, instanceSatelliteRefs, report, instanceScopeId } =
		params

	const group = report.groups.find((candidate) => candidate.primary.sourceRef?.id === primaryRef.id)

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
		const changed =
			satelliteReport.summary.added +
				satelliteReport.summary.removed +
				satelliteReport.summary.modified >
			0
		if (!changed) continue

		if (group) {
			// Fold the satellite root AND every changed descendant (e.g. a SubCategory inside a
			// FunctionCategory) as companions of the primary group, so `acceptedRefIds` collects
			// the nested ids and the gated reconcile writes them.
			if (satelliteReport.root.change !== 'unchanged') group.companions.push(satelliteReport.root)
			collectChangedDescendants({ node: satelliteReport.root, out: group.companions })
		} else {
			// The primary itself is unchanged, so a satellite-only change has no group to ride.
			// Surface it as its OWN decision group(s) — otherwise it would be invisible and
			// never applied (item: AllocationRole/FunctionCategory not highlighted).
			report.groups.push(...groupChanges(satelliteReport.root, instanceScopeId))
			report.needsDecisions = true
		}
	}

	// removals ride the primary group (coupling invariant): a target instance satellite
	// whose template ELEMENT was removed from the source. Catalog/shared satellites persist
	// when merely un-referenced, so the trigger is source-element non-existence, NOT a link drop.
	if (group) {
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
	}

	return report
}
