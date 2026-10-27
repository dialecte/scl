import { instanceTagOf } from './instance-tag'
import { placeholderLineageOf, referenceIdentity, referenceNameIdentity } from './reference-match'

import { REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'

import type { ChildMatch, PinnedMatches } from './match-child.types'
import type { PlaceholderLineages } from './placeholder-lineages.types'
import type { RedirectedSourceUuids } from './reference-match.types'
import type { Config } from '@/v2019C1/config'
import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * Find the instance child that corresponds to a source child — the ONE matcher shared by the diff
 * (report) and reconcile (apply) sides, so both pair children identically:
 *  - **Identified** elements match by `templateUuid` lineage (the source `uuid`) via `index`, guarded
 *    to the same tag: a placeholder `templateUuid` smeared across unrelated tags (real .ssd files
 *    reuse one dummy value on Substation, LNode, ...) can coincide with a source `uuid`; a cross-type
 *    hit is a collision, not a lineage.
 *  - A uuid-less **REFERENCE** (e.g. `FunctionRef`) matches by its reference IDENTITY — the target
 *    `*Uuid` it points to, brought back to the source by the scenario's key — never by tag position. Only where the
 *    project's target carries a placeholder lineage the consumer lets pair by name (`placeholderLineages`) does it
 *    fall back to the names of what both name (the match says so: `pairedByName`). `refsAlwaysAdded` forces a fresh
 *    instantiation's refs to surface as `added` instead of matching a prior instance's ref. A reference
 *    to a project element a source element was mapped onto reads as a reference to that source element
 *    (`redirectedSourceUuids`), whatever the two are named.
 *  - Any other uuid-less element (e.g. `FunctionRoleContent`) matches a same-tag sibling by position.
 *
 * Inside an element of the PROJECT a source element is mapped onto (`matchContainersByName`), an
 * identified container with no lineage counterpart lands on the same-tag child of the same name —
 * the project's own container, the one the layer merge pours into on a first placement.
 *
 * A child whose counterpart was decided elsewhere (`pinnedMatches` — a structural level, which lands
 * where its placement mapping says) is not matched by any of these rules.
 *
 * In an element several instances of one template share, each instance has its own reference
 * children: those of another instance (`foreignInstanceIds`) are never the counterpart of a child of
 * this one, however alike they read once brought back to template space.
 *
 * The source side reads raw identities; the candidate (target) side is brought back to the source by
 * `matchKey` — that role split is internal here, callers only say the scenario's key.
 */
export async function matchChild(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		instanceParent: AnyTreeRecord
		index: Map<string, AnyTreeRecord>
		matchedInstanceIds: ReadonlySet<string>
		/** The scenario's key: how a candidate reference's target is brought back to the source. */
		matchKey: MatchKey
		refsAlwaysAdded?: boolean
		redirectedSourceUuids?: RedirectedSourceUuids
		matchContainersByName?: boolean
		pinnedMatches?: PinnedMatches
		foreignInstanceIds?: ReadonlySet<string>
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. Default none. */
		placeholderLineages?: PlaceholderLineages
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, instanceParent, index, matchedInstanceIds } = params
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	// where this child lands was decided elsewhere: it is that element, or a new one
	if (params.pinnedMatches?.has(sourceChild.id)) {
		const instanceId = params.pinnedMatches.get(sourceChild.id)
		const pinned = instanceId
			? instanceParent.tree.find((instanceChild) => instanceChild.id === instanceId)
			: undefined
		return pinned && { record: pinned }
	}

	// a template-only element (a subfunction template) is matched as the element it becomes
	const instanceTag = instanceTagOf(sourceChild.tagName)

	const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
	if (sourceUuid) {
		const matched = index.get(sourceUuid)
		if (matched && matched.tagName === instanceTag) return { record: matched }
		if (!params.matchContainersByName) return undefined
		const sameName = await findSameNameChild(sourceQuery, {
			targetQuery,
			sourceChild,
			instanceParent,
			matchedInstanceIds,
		})
		return sameName && { record: sameName }
	}

	// INSTANTIATE: a fresh instantiation creates its OWN per-instance refs, so never match a link to a
	// prior instance's ref — surface it as `added` (the prior refs stay as kept context).
	if (refsAlwaysAdded && REFERENCE_TAG_NAMES.has(sourceChild.tagName)) return undefined

	const candidates = instanceParent.tree.filter(
		(instanceChild) =>
			instanceChild.tagName === instanceTag &&
			!matchedInstanceIds.has(instanceChild.id) &&
			!params.foreignInstanceIds?.has(instanceChild.id),
	)
	if (candidates.length === 0) return undefined

	if (REFERENCE_TAG_NAMES.has(sourceChild.tagName)) {
		// The source ref's target uuid is read as it is (do not normalize it — an extracted template may
		// carry its own `templateUuid`). The candidate ref's target uuid is brought back to the source by
		// the scenario's key so the two compare equal.
		const sourceIdentity = await referenceIdentity(sourceQuery, sourceChild, { side: 'source' })
		if (sourceIdentity === undefined) return { record: candidates[0] }
		for (const candidate of candidates) {
			const candidateIdentity = await referenceIdentity(targetQuery, candidate, {
				side: 'instance',
				matchKey: params.matchKey,
				redirectedSourceUuids: params.redirectedSourceUuids,
			})
			if (candidateIdentity === sourceIdentity) return { record: candidate }
		}
		return matchReferenceByName(sourceQuery, {
			targetQuery,
			sourceChild,
			candidates,
			matchKey: params.matchKey,
			placeholderLineages: params.placeholderLineages ?? new Set(),
		})
	}

	return { record: candidates[0] }
}

/**
 * The candidate reference naming, by name, what the source reference names — only one whose target carries a
 * placeholder lineage the consumer lets pair by name: a project authored with placeholder `templateUuid`s cannot bring
 * its uuids back to the template's.
 */
async function matchReferenceByName(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		candidates: readonly AnyTreeRecord[]
		matchKey: MatchKey
		placeholderLineages: PlaceholderLineages
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, candidates, matchKey, placeholderLineages } = params
	if (placeholderLineages.size === 0) return undefined
	const sourceNameIdentity = await referenceNameIdentity(sourceQuery, sourceChild)
	if (sourceNameIdentity === undefined) return undefined
	for (const candidate of candidates) {
		const placeholder = await placeholderLineageOf(targetQuery, candidate, {
			matchKey,
			placeholderLineages,
		})
		if (!placeholder) continue
		const candidateNameIdentity = await referenceNameIdentity(targetQuery, candidate)
		if (candidateNameIdentity === sourceNameIdentity) {
			return { record: candidate, pairedByName: placeholder }
		}
	}
	return undefined
}

/** The not-yet-matched child of `instanceParent` with the tag and the name of `sourceChild`. */
async function findSameNameChild(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		instanceParent: AnyTreeRecord
		matchedInstanceIds: ReadonlySet<string>
	},
): Promise<AnyTreeRecord | undefined> {
	const { targetQuery, sourceChild, instanceParent, matchedInstanceIds } = params

	const name = await sourceQuery.any.getAttribute(sourceChild, { name: 'name' })
	if (!name) return undefined

	for (const instanceChild of instanceParent.tree) {
		if (instanceChild.tagName !== instanceTagOf(sourceChild.tagName)) continue
		if (matchedInstanceIds.has(instanceChild.id)) continue
		const instanceName = await targetQuery.any.getAttribute(instanceChild, { name: 'name' })
		if (instanceName === name) return instanceChild
	}
	return undefined
}
