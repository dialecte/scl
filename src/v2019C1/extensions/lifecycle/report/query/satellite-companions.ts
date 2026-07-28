import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { groupChanges } from '@/v2019C1/extensions/lifecycle/engine/group'
import { findInstanceByTemplateUuid } from '@/v2019C1/extensions/lifecycle/instance'

import type { Config, Scl } from '@/v2019C1/config'
import type { LeftoverRefPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

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
		report: InstanceDiff
		/** Instance scope for a standalone satellite group (primary-unchanged case). */
		instanceScopeId?: string
		/** INSTANTIATE: force satellite reference children to `added` (new per-instance refs). */
		refsAlwaysAdded?: boolean
	},
): Promise<InstanceDiff> {
	const { sourceQuery, primaryRef, satelliteRefs, instanceSatelliteRefs, report, instanceScopeId } =
		params

	const group = report.groups.find((candidate) => candidate.primary.sourceRef?.id === primaryRef.id)

	for (const satelliteRef of satelliteRefs) {
		const { uuid: sourceUuid, name: sourceName } = await sourceQuery.any.getAttributes(satelliteRef)

		const instance = await findInstanceByTemplateUuid(query, {
			tagName: satelliteRef.tagName,
			sourceUuid,
			sourceName,
		})
		const satelliteReport = await diff({
			sourceQuery,
			targetQuery: query,
			sourceRootRef: satelliteRef,
			instanceRootRef: instance,
			// Shared/catalog satellite: its extra reference children belong to OTHER primaries/
			// instances; a scoped single-primary update must not flag them as removed.
			keepLeftoverRefs: true,
			// Provenance override: a leftover ref IS a genuine removal when its target is in the
			// source's own scope and the source satellite no longer references it (see below).
			leftoverRefPolicy: await buildLeftoverRefPolicy(query, sourceQuery, satelliteRef),
			// INSTANTIATE: the satellite container may already exist (matched), but this instantiation's
			// per-instance refs are genuinely new — classify them added instead of lineage-matching a
			// prior instance's refs (which would report a no-op while apply still merges 4 more in).
			refsAlwaysAdded: params.refsAlwaysAdded ?? false,
		})
		const changed =
			satelliteReport.summary.added +
				satelliteReport.summary.removed +
				satelliteReport.summary.modified >
			0
		if (!changed) continue

		if (group) {
			// Fold the satellite as a STRUCTURED companion of the primary group: push the diff
			// ROOT and preserve its nesting (the root may be an already-existing container matched
			// by `instanceRef`, carrying a newly-`added` descendant). Keeping the structure lets the
			// review correlate the added descendant to its existing container by position — a flat
			// bag loses that anchor (a `FunctionCatRef` has no `name` to resolve against). The gate
			// (`acceptedRefIds`) recurses the subtree, so nested accepted ids are still written.
			group.companions.push(satelliteReport.root)
		} else {
			// The primary itself is unchanged, so a satellite-only change has no group to ride.
			// Surface it as its OWN decision group(s) — otherwise it would be invisible and
			// never applied (item: AllocationRole/FunctionCategory not highlighted).
			report.groups.push(...groupChanges(satelliteReport.root, instanceScopeId))
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

/**
 * Build the provenance policy for a shared satellite's leftover reference children. A leftover ref is
 * a GENUINE removal (not another primary's link) only when BOTH hold:
 *  - its target's `templateUuid` is a real element `uuid` IN THE SOURCE being updated (in-scope —
 *    excludes other applications' targets and dangling/placeholder lineages);
 *  - the SOURCE satellite no longer references that template target (genuinely dropped, not a
 *    multi-instance sibling the source still references).
 * Otherwise keep. Under malformed lineage the target does not resolve in-source, so it degrades to
 * keep (no regression vs the blanket behaviour).
 */
async function buildLeftoverRefPolicy(
	query: Core.Query<Config>,
	sourceQuery: Core.Query<Config>,
	satelliteRef: Scl.Ref<Scl.ElementsOf>,
): Promise<LeftoverRefPolicy> {
	// Template targets the SOURCE satellite still references (its own ref children's target uuids).
	const sourceTree = await sourceQuery.any.getTree(satelliteRef)
	const sourceReferencedUuids = new Set<string>()
	if (sourceTree) await collectReferencedUuids(sourceQuery, sourceTree, sourceReferencedUuids)

	return async (instanceChild) => {
		const pairs = UUID_REFERENCE_PAIRS[instanceChild.tagName as keyof typeof UUID_REFERENCE_PAIRS]
		if (!pairs) return 'keep'
		for (const pair of pairs) {
			const uuidValue = await query.any.getAttribute(instanceChild, { name: pair.attribute.uuid })
			if (!uuidValue) continue
			const target = await findByUuid(query, uuidValue, pair.target)
			if (!target) continue
			const targetTemplateUuid = await query.any.getAttribute(target, { name: 'templateUuid' })
			if (!targetTemplateUuid) continue
			// in-scope: the target's template lineage is an element of the SOURCE being updated
			if (!(await findByUuid(sourceQuery, targetTemplateUuid, pair.target))) continue
			// still referenced by the SOURCE satellite -> multi-instance sibling -> keep
			if (sourceReferencedUuids.has(targetTemplateUuid)) continue
			return 'removed'
		}
		return 'keep'
	}
}

/** Collect the target uuids referenced by every reference child in a satellite subtree. */
async function collectReferencedUuids(
	query: Core.Query<Config>,
	node: AnyTreeRecord,
	out: Set<string>,
): Promise<void> {
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (pairs) {
		for (const pair of pairs) {
			const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
			if (uuidValue) out.add(uuidValue)
		}
	}
	for (const child of node.tree) await collectReferencedUuids(query, child, out)
}

async function findByUuid(
	query: Core.Query<Config>,
	uuid: string,
	targetTags: readonly string[],
): Promise<AnyTreeRecord | undefined> {
	for (const tagName of targetTags) {
		const [match] = await query.any.findByAttributes({
			tagName: tagName as Parameters<typeof query.any.findByAttributes>[0]['tagName'],
			attributes: { uuid },
		})
		if (match) return match as AnyTreeRecord
	}
	return undefined
}
