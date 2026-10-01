import { toRef } from '@dialecte/core/helpers'

import { resolveUniqueValue } from '@/v2019C1/extensions/lifecycle/constraints'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { extractElementTitle } from '@/v2019C1/extensions/presentation/query'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'

import type {
	DecisionMapping,
	MappingCandidate,
	MappingPolicy,
	ReportMapping,
	ResolvedMapping,
} from './mapping.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What the report says about one shared source element: where it lands (as resolved), why,
 * and every project element it could be mapped onto instead. For an element to create, the
 * name is the one apply will give it: the requested name, made free at the level it lands on.
 */
export async function describeMapping(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceRef: Scl.Ref<Scl.ElementsOf> & { id: string }
		policy: MappingPolicy
		resolved: ResolvedMapping
		/** The consumer's choice for this source element, when it made one. */
		decision?: DecisionMapping
		/** The project element the template is placed under. */
		anchor?: Scl.Ref<Scl.ElementsOf>
	},
): Promise<ReportMapping> {
	const { sourceQuery, sourceRef, policy, resolved, decision, anchor } = params

	const shared = {
		id: sourceRef.id,
		tagName: policy.tagName,
		reason: resolved.reason,
		ambiguous: resolved.ambiguous,
		selectable: policy.selectable,
		locked: resolved.locked,
	}

	if (resolved.existing) {
		const existingRef = toRef(resolved.existing) as Scl.Ref<Scl.ElementsOf>
		// a locked mapping is not a choice: the one element listed is the one it is mapped onto
		const candidates = resolved.locked
			? [await describeCandidate(query, existingRef)]
			: await listCandidates(query, { policy, anchor })
		return { ...shared, candidates, mapping: { existing: existingRef } }
	}

	const candidates = await listCandidates(query, { policy, anchor })

	const sourceName = await sourceQuery.any.getAttribute(sourceRef, { name: policy.key })
	const requestedName = decision && 'create' in decision ? decision.create.name : undefined
	const name = await proposeFreeName(query, {
		sourceQuery,
		sourceRef,
		policy,
		anchor,
		name: requestedName ?? sourceName,
	})
	return { ...shared, candidates, mapping: { create: { name } } }
}

/** `name`, or the first free variant of it, at the level a created element lands on. */
async function proposeFreeName(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceRef: Scl.Ref<Scl.ElementsOf>
		policy: MappingPolicy
		anchor?: Scl.Ref<Scl.ElementsOf>
		name: string | undefined
	},
): Promise<string | undefined> {
	const { sourceQuery, sourceRef, policy, anchor, name } = params
	if (!anchor || !name) return name

	const structure = await resolveTargetStructure(query, anchor)
	const parentRef = await resolveStructureRef(sourceQuery, sourceRef, structure)
	return resolveUniqueValue(query, {
		parentRef,
		childTag: policy.tagName,
		candidate: { [policy.key]: name },
		attr: policy.key,
	})
}

/**
 * Every project element of the policy's tag, each with its title and where it sits — listed from
 * the placement outwards (the anchor's own level first, then each level above it, then the rest of
 * the project), and by path within one distance.
 */
async function listCandidates(
	query: Core.Query<Config>,
	params: { policy: MappingPolicy; anchor?: Scl.Ref<Scl.ElementsOf> },
): Promise<MappingCandidate[]> {
	const { policy, anchor } = params

	const anchorChainIds = await listAnchorChainIds(query, { anchor })

	const records = await query.any.getRecordsByTagName(policy.tagName)
	const ranked: { candidate: MappingCandidate; distance: number }[] = []
	for (const record of records) {
		const ref = toRef(record) as Scl.Ref<Scl.ElementsOf>
		const candidate = await describeCandidate(query, ref)
		const ancestors = await query.any.findAncestors(ref)
		const distance = distanceFromAnchor({ anchorChainIds, ancestorIds: ancestors.map(idOf) })
		ranked.push({ candidate, distance })
	}

	return ranked.sort(byDistanceThenPath).map((entry) => entry.candidate)
}

/** A project element as the report lists it: its title and where it sits. */
async function describeCandidate(
	query: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
): Promise<MappingCandidate> {
	const title = await extractElementTitle(query, ref)
	const elementPath = await buildElementPath(query, ref)
	return { ref, title, path: elementPath?.path ?? '' }
}

/** The anchor's id then each of its ancestors', nearest first. */
async function listAnchorChainIds(
	query: Core.Query<Config>,
	params: { anchor?: Scl.Ref<Scl.ElementsOf> },
): Promise<string[]> {
	const { anchor } = params
	if (!anchor?.id) return []

	const ancestors = await query.any.findAncestors(anchor)
	return [anchor.id, ...ancestors.map(idOf)]
}

/** How many levels above the anchor the element's container is — `Infinity` when it is elsewhere. */
function distanceFromAnchor(params: {
	anchorChainIds: readonly string[]
	ancestorIds: readonly string[]
}): number {
	const { anchorChainIds, ancestorIds } = params
	const distance = anchorChainIds.findIndex((anchorChainId) => ancestorIds.includes(anchorChainId))
	return distance === -1 ? Number.POSITIVE_INFINITY : distance
}

function byDistanceThenPath(
	first: { candidate: MappingCandidate; distance: number },
	second: { candidate: MappingCandidate; distance: number },
): number {
	if (first.distance !== second.distance) return first.distance < second.distance ? -1 : 1
	return first.candidate.path.localeCompare(second.candidate.path)
}

function idOf(record: { id: string }): string {
	return record.id
}
