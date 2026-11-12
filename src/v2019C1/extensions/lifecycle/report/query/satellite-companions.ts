import { toRef } from '@dialecte/core/helpers'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { describeContribution } from '@/v2019C1/extensions/lifecycle/engine/contribute'
import { leaveOutOfScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { groupChanges } from '@/v2019C1/extensions/lifecycle/engine/group'
import { collectForeignReferenceIds } from '@/v2019C1/extensions/lifecycle/instance'
import {
	createReportPass,
	describeMapping,
	findMappingPolicy,
	resolveSatelliteMappings,
	resolveSatelliteRemovals,
} from '@/v2019C1/extensions/lifecycle/mapping'
import { holdsPairingByName } from '@/v2019C1/extensions/lifecycle/report/report-warnings'

import type { SatelliteFoldTarget } from './cross-cutting-satellites.types'
import type { SatelliteDiffParams } from './satellite-companions.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type { DiffPolicy } from '@/v2019C1/extensions/lifecycle/engine/diff-policy.types'
import type {
	DiffNode,
	InstanceDiff,
	LeftoverRefPolicy,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlaceholderLineages } from '@/v2019C1/extensions/lifecycle/engine/placeholder-lineages.types'
import type { RemovalBase } from '@/v2019C1/extensions/lifecycle/engine/removal-base.types'
import type { ResolveForeignScope } from '@/v2019C1/extensions/lifecycle/instance'
import type {
	DecisionMappings,
	ReportMapping,
	ReportPass,
	ResolvedMapping,
	ResolvedMappings,
} from '@/v2019C1/extensions/lifecycle/mapping'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Fold each satellite's changes into the primary's decision group as read-only
 * COMPANIONS. Generic over the layer: the caller resolves the
 * satellite refs from the SOURCE (reverse-ref for the function's FunctionCategory,
 * outward-ref for the application's AllocationRole) and, for removal detection, the
 * matching refs from the TARGET instance (`instanceSatelliteRefs`, resolved with the
 * same finder against the instance primary).
 *
 * Three companion kinds, all riding the primary's group (coupling invariant - never
 * independently decidable):
 *  - added / modified: a source satellite diffed against the project element it lands on — for a
 *    shared element, the one its mapping resolves to (`resolveSatelliteMappings`, the answer the
 *    apply reads too); for one the instance holds its own of, the one it holds. One with nothing
 *    to land on surfaces all-added;
 *  - removed: what goes of a TARGET instance satellite the template no longer brings anything for
 *    (`resolveSatelliteRemovals`, the answer the apply writes) -> folded as `removed` companions so
 *    accepting the primary deletes them.
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
		report: SatelliteFoldTarget
		/** Instance scope for a standalone satellite group (primary-unchanged case). */
		instanceScopeId?: string
		/** The consumer's choices for shared satellites, by source record id. */
		decisionMappings?: DecisionMappings
		/** The project element the template is placed under. */
		anchor?: Scl.Ref<Scl.ElementsOf>
		/** How an instance element carries its source element's uuid. Default `templateUuid`. */
		matchKey?: MatchKey
		/** Where the shared satellites land, when the caller already resolved it. */
		resolvedMappings?: ResolvedMappings
		/**
		 * The instance being updated, for the layer that owns shared satellites: what the instance
		 * gave to a project element the template no longer brings anything for is then announced.
		 */
		instancePrimaryRef?: Scl.Ref<Scl.ElementsOf>
		/**
		 * What belongs to the other instances of the template the satellites are folded for: a shared
		 * satellite's references to it are theirs, not this instance's.
		 */
		resolveForeignScope?: ResolveForeignScope
		/** What the whole report already listed and named, shared by every fold of that report. */
		pass?: ReportPass
		/** What tells a satellite the source dropped from one the project added: see `classifyUnmatched`. */
		removalBase: RemovalBase
		/** What the consumer's resolution tells the diff, read once: see `DiffPolicy`. */
		diffPolicy: DiffPolicy
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. */
		placeholderLineages?: PlaceholderLineages
		/** Whose names an update follows: see `visibleAttributes`. */
		namesFollow: NamesFollow
		/** The source elements the instance's selection of functional variants leaves out: see `diff`. */
		notSelected?: ReadonlySet<string>
		/** What the satellites' references may name: what the placement places or the instance holds. */
		scope: ContributionScope
		/** On a first placement, source elements it places onto elements the project holds (a function stood on). */
		redirectMappings?: readonly RedirectMapping[]
		/** Where the levels of the template land on elements the project holds: a shared satellite is found by name only there. */
		landings: readonly RedirectMapping[]
	},
): Promise<void> {
	const { sourceQuery, primaryRef, satelliteRefs, instanceSatelliteRefs, report, instanceScopeId } =
		params
	const matchKey = params.matchKey ?? 'templateUuid'
	const firstTime = instanceScopeId === undefined

	const group = report.groups.find((candidate) => candidate.primary.sourceRef?.id === primaryRef.id)

	const resolvedMappings =
		params.resolvedMappings ??
		(await resolveSatelliteMappings(query, {
			sourceQuery,
			satelliteRefs,
			instanceSatelliteRefs: firstTime ? [] : instanceSatelliteRefs,
			decisionMappings: params.decisionMappings,
			matchKey: params.matchKey,
			landings: params.landings,
		}))
	// what the report already listed and named: the caller's, else this fold's own
	const pass = params.pass ?? createReportPass()
	for (const satelliteRef of satelliteRefs) {
		const {
			target: instance,
			projectOwned,
			mapping,
		} = await findSatelliteTarget(query, {
			sourceQuery,
			satelliteRef,
			firstTime,
			resolved: satelliteRef.id ? resolvedMappings.get(satelliteRef.id) : undefined,
			decisionMappings: params.decisionMappings,
			anchor: params.anchor,
			pass,
		})
		if (mapping) report.mappings = [...(report.mappings ?? []), mapping]
		// a first placement onto an element the project holds only contributes to it, as the apply pours it
		const satelliteReport =
			firstTime && instance
				? await describeContribution(query, {
						sourceQuery,
						source: satelliteRef,
						target: toRef(instance) as Scl.Ref<Scl.ElementsOf>,
						scope: params.scope,
						matchKey,
						leftOut: params.notSelected,
						redirectMappings: params.redirectMappings,
						placeholderLineages: params.placeholderLineages,
					})
				: await diffSatellite(query, { ...params, satelliteRef, instance, projectOwned, matchKey })
		const changed =
			satelliteReport.summary.added +
				satelliteReport.summary.removed +
				satelliteReport.summary.modified >
			0
		if (!changed) {
			// a change the update keeps opens no decision, nor does a reference paired by name: listed with the
			// primary's tree, so the report says it
			if (satelliteReport.summary.kept > 0 || holdsPairingByName(satelliteReport.root)) {
				report.root.children.push(satelliteReport.root)
			}
			continue
		}

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

	// what goes of a satellite of the instance the template no longer brings anything for — the
	// answer the apply writes: the element, removed with the primary's group (coupling invariant) or
	// as a decision of its own when the primary is unchanged, one the project added kept by default;
	// or, while something outside the instance names it, only what the instance gave it
	if (params.instancePrimaryRef) {
		const removals = await resolveSatelliteRemovals(query, {
			sourceQuery,
			instancePrimaryRef: params.instancePrimaryRef,
			instanceSatelliteRefs: instanceSatelliteRefs ?? [],
			resolvedMappings,
			removalBase: params.removalBase,
			matchKey,
		})
		for (const { satellite, change, whole, contributions } of removals) {
			for (const removed of whole ? [satellite] : contributions) {
				const node: DiffNode = {
					change,
					tagName: removed.tagName,
					instanceRef: toRef(removed),
					children: [],
				}
				if (group && change === 'removed') group.companions.push(node)
				else report.groups.push(...groupChanges(node, instanceScopeId))
			}
		}
	}
}

/**
 * A source satellite compared with the element of the project it lands on, or with none: its reference children naming
 * what the placement does not place left out, those of another instance never its counterparts, a leftover one removed
 * only when the source genuinely dropped it.
 */
async function diffSatellite(
	query: Core.Query<Config>,
	params: SatelliteDiffParams,
): Promise<InstanceDiff> {
	const { sourceQuery, satelliteRef, instance, matchKey } = params
	const foreignScope = instance ? await params.resolveForeignScope?.() : undefined
	const foreignInstanceIds =
		instance && foreignScope
			? await collectForeignReferenceIds(query, { sharedRootRef: instance, foreignScope })
			: undefined
	// a reference naming what the placement does not place is neither listed nor written
	const leftOut = await leaveOutOfScope(sourceQuery, {
		root: satelliteRef,
		scope: params.scope,
		leftOut: params.notSelected,
	})
	// Provenance override: a leftover ref IS a genuine removal when its target is in the source's own scope and the
	// source satellite no longer references it (see below).
	const leftoverRefPolicy = await buildLeftoverRefPolicy(query, {
		sourceQuery,
		satelliteRef,
		matchKey,
	})
	return diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: satelliteRef,
		instanceRootRef: instance,
		instanceRootIsProjectOwned: params.projectOwned,
		// Shared/catalog satellite: its extra reference children belong to OTHER primaries/instances; a scoped
		// single-primary update must not flag them as removed.
		keepLeftoverRefs: true,
		leftoverRefPolicy,
		foreignInstanceIds,
		matchKey,
		removalBase: params.removalBase,
		diffPolicy: params.diffPolicy,
		placeholderLineages: params.placeholderLineages,
		namesFollow: params.namesFollow,
		notSelected: leftOut,
	})
}

/**
 * The project element a source satellite is diffed against. A shared element lands where its
 * mapping resolves, exactly as the apply does. On a first placement the element found is only
 * contributed to, whoever owns it; on an update, an element the project owns (`projectOwned`)
 * only receives what the source contributes, and an instance of the source is compared in full.
 * A satellite the instance holds its own of is diffed against the one it holds, if any.
 */
async function findSatelliteTarget(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		satelliteRef: Scl.Ref<Scl.ElementsOf>
		firstTime: boolean
		resolved: ResolvedMapping | undefined
		decisionMappings?: DecisionMappings
		anchor?: Scl.Ref<Scl.ElementsOf>
		pass?: ReportPass
	},
): Promise<{
	target: AnyTrackedRecord | undefined
	projectOwned: boolean
	mapping?: ReportMapping
}> {
	const { sourceQuery, satelliteRef, firstTime, resolved } = params

	const policy = findMappingPolicy(satelliteRef.tagName)
	const satelliteId = satelliteRef.id
	if (resolved && policy && satelliteId) {
		const mapping = await describeMapping(query, {
			sourceQuery,
			sourceRef: { ...satelliteRef, id: satelliteId },
			policy,
			resolved,
			decision: params.decisionMappings?.get(satelliteId),
			anchor: params.anchor,
			pass: params.pass,
		})
		return {
			target: resolved.existing,
			projectOwned: firstTime || resolved.projectOwned,
			mapping,
		}
	}

	return { target: resolved?.existing, projectOwned: resolved?.projectOwned ?? false }
}

/**
 * Build the provenance policy for a shared satellite's leftover reference children. A leftover ref is
 * a GENUINE removal (not another primary's link) only when BOTH hold:
 *  - its target's lineage under the scenario's key is a real element `uuid` IN THE SOURCE being
 *    updated (in-scope — excludes other applications' targets and dangling/placeholder lineages);
 *  - the SOURCE satellite no longer references that template target (genuinely dropped, not a
 *    multi-instance sibling the source still references).
 * Otherwise keep. Under malformed lineage the target does not resolve in-source, so it degrades to
 * keep (no regression vs the blanket behaviour).
 */
async function buildLeftoverRefPolicy(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		satelliteRef: Scl.Ref<Scl.ElementsOf>
		matchKey: MatchKey
	},
): Promise<LeftoverRefPolicy> {
	const { sourceQuery, satelliteRef, matchKey } = params
	// Template targets the SOURCE satellite still references (its own ref children's target uuids).
	const sourceTree = await sourceQuery.any.getTree(satelliteRef)
	const sourceReferencedUuids = new Set<string>()
	if (sourceTree)
		await collectReferencedUuids(sourceQuery, {
			node: sourceTree,
			out: sourceReferencedUuids,
		})

	return async (instanceChild) => {
		const pairs = UUID_REFERENCE_PAIRS[instanceChild.tagName as keyof typeof UUID_REFERENCE_PAIRS]
		if (!pairs) return 'keep'
		for (const pair of pairs) {
			const uuidValue = await query.any.getAttribute(instanceChild, { name: pair.attribute.uuid })
			if (!uuidValue) continue
			const target = await findByUuid(query, { uuid: uuidValue, targetTags: pair.target })
			if (!target) continue
			const targetLineage = await query.any.getAttribute(target, { name: matchKey })
			if (!targetLineage) continue
			// in-scope: the target's lineage is an element of the SOURCE being updated
			if (!(await findByUuid(sourceQuery, { uuid: targetLineage, targetTags: pair.target })))
				continue
			// still referenced by the SOURCE satellite -> multi-instance sibling -> keep
			if (sourceReferencedUuids.has(targetLineage)) continue
			return 'removed'
		}
		return 'keep'
	}
}

/** Collect the target uuids referenced by every reference child in a satellite subtree. */
async function collectReferencedUuids(
	query: Core.Query<Config>,
	params: { node: AnyTreeRecord; out: Set<string> },
): Promise<void> {
	const { node, out } = params
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (pairs) {
		for (const pair of pairs) {
			const uuidValue = await query.any.getAttribute(node, { name: pair.attribute.uuid })
			if (uuidValue) out.add(uuidValue)
		}
	}
	for (const child of node.tree) await collectReferencedUuids(query, { node: child, out })
}

async function findByUuid(
	query: Core.Query<Config>,
	params: { uuid: string; targetTags: readonly string[] },
): Promise<AnyTreeRecord | undefined> {
	const { uuid, targetTags } = params
	for (const tagName of targetTags) {
		const [match] = await query.any.findByAttributes({
			tagName: tagName as Parameters<typeof query.any.findByAttributes>[0]['tagName'],
			attributes: { uuid },
		})
		if (match) return match as AnyTreeRecord
	}
	return undefined
}
