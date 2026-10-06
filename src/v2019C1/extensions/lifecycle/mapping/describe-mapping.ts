import { toRef } from '@dialecte/core/helpers'

import { resolveUniqueValue } from '@/v2019C1/extensions/lifecycle/constraints'
import { resolveTargetStructure } from '@/v2019C1/extensions/lifecycle/instantiate/transaction/resolve-target-structure'
import { resolveStructureRef } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import { extractElementTitle } from '@/v2019C1/extensions/presentation/query'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'

import type {
	DecisionMapping,
	MappingCandidate,
	MappingCollision,
	MappingPolicy,
	ReportMapping,
	ReportPass,
	ResolvedMapping,
} from './mapping.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** What one pass over a report shares between the elements it describes — empty to start with. */
export function createReportPass(): ReportPass {
	return { candidates: new Map(), claimedValues: new Map() }
}

/**
 * What the report says about one shared source element: where it lands (as resolved), why,
 * and every project element it could be mapped onto instead. For an element to create, the
 * name is the one apply will give it: the requested name, made free at the level it lands on —
 * against the project and against the elements the same report already creates there.
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
		/** What the report already listed and named — its own when the caller describes one element. */
		pass?: ReportPass
	},
): Promise<ReportMapping> {
	const { sourceQuery, sourceRef, policy, resolved, decision, anchor } = params
	const pass = params.pass ?? createReportPass()

	const shared = {
		id: sourceRef.id,
		tagName: policy.tagName,
		kind: 'shared' as const,
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
			: await listCandidates(query, { policy, anchor, pass })
		return {
			...shared,
			candidates,
			mapping: { existing: existingRef },
			...(resolved.projectOwned ? { projectOwned: true as const } : {}),
		}
	}

	const candidates = await listCandidates(query, { policy, anchor, pass })
	// nothing is picked and nothing is created until the consumer chose
	if (resolved.undecided) return { ...shared, candidates }

	const sourceName = await sourceQuery.any.getAttribute(sourceRef, { name: policy.key })
	const requestedName = decision && 'create' in decision ? decision.create.name : undefined
	const landing = await describeLanding(query, {
		sourceQuery,
		sourceRef,
		policy,
		anchor,
		name: requestedName ?? sourceName,
		pass,
	})
	return {
		...shared,
		candidates,
		mapping: { create: { name: landing.name } },
		...(landing.collision ? { collision: landing.collision } : {}),
		...(landing.parentPath ? { parentPath: landing.parentPath } : {}),
	}
}

/**
 * Where a created element lands: the project element it is created under, and `name` or the
 * first free variant of it there — with what became of `name` when it was not free.
 */
async function describeLanding(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceRef: Scl.Ref<Scl.ElementsOf>
		policy: MappingPolicy
		anchor?: Scl.Ref<Scl.ElementsOf>
		name: string | undefined
		pass: ReportPass
	},
): Promise<{ name: string | undefined; parentPath?: string; collision?: MappingCollision }> {
	const { sourceQuery, sourceRef, policy, anchor, name, pass } = params
	if (!anchor) return { name }

	const structure = await resolveTargetStructure(query, anchor)
	const parentRef = await resolveStructureRef(sourceQuery, sourceRef, structure)
	const parentElementPath = await buildElementPath(query, parentRef)
	const parentPath = parentElementPath?.path || undefined
	if (!name) return { name, parentPath }

	const claimed = claimedValuesAt({
		pass,
		parentRef,
		childTag: policy.tagName,
		attr: policy.key,
	})
	const freeName = await resolveUniqueValue(query, {
		parentRef,
		childTag: policy.tagName,
		candidate: { [policy.key]: name },
		attr: policy.key,
		claimed,
	})
	claimed.add(freeName)

	const collision = describeCollision({ attr: policy.key, asked: name, given: freeName })
	return { name: freeName, parentPath, collision }
}

/**
 * The values the report already gave to elements of a tag to create under one element, for the
 * attribute they are unique on.
 */
export function claimedValuesAt(params: {
	pass: ReportPass
	parentRef: Scl.Ref<Scl.ElementsOf>
	childTag: string
	attr: string
}): Set<string> {
	const { pass, parentRef, childTag, attr } = params

	const place = `${parentRef.tagName}|${parentRef.id}|${childTag}|${attr}`
	const claimed = pass.claimedValues.get(place) ?? new Set<string>()
	pass.claimedValues.set(place, claimed)
	return claimed
}

/** What became of a value asked for an element to create — nothing to say when it was free. */
export function describeCollision(params: {
	attr: string
	asked: string
	given: string
}): MappingCollision | undefined {
	const { attr, asked, given } = params
	return asked === given ? undefined : { status: 'resolved', attr, from: asked, to: given }
}

/**
 * Every project element of the policy's tag, each with its title and where it sits — listed from
 * the placement outwards (the anchor's own level first, then each level above it, then the rest of
 * the project), and by path within one distance.
 */
async function listCandidates(
	query: Core.Query<Config>,
	params: {
		policy: MappingPolicy
		anchor?: Scl.Ref<Scl.ElementsOf>
		pass: ReportPass
	},
): Promise<MappingCandidate[]> {
	const { policy, anchor, pass } = params

	const cacheKey = `${policy.tagName}|${anchor?.id ?? ''}`
	const cached = pass.candidates.get(cacheKey)
	if (cached) return [...cached]

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

	const candidates = ranked.sort(byDistanceThenPath).map((entry) => entry.candidate)
	pass.candidates.set(cacheKey, candidates)
	return [...candidates]
}

/** A project element as the report lists it: its title and where it sits. */
export async function describeCandidate(
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
