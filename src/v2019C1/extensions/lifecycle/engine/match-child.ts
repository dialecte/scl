import { referenceIdentity, referenceNameIdentity } from './reference-match'

import { REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'

import type { RedirectedSourceUuids } from './reference-match'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * Source children whose counterpart is decided elsewhere, by source record id: the record id of the
 * instance child each lands on, or `undefined` for a child that is new whatever the instance holds.
 */
export type PinnedMatches = ReadonlyMap<string, string | undefined>

/**
 * Find the instance child that corresponds to a source child — the ONE matcher shared by the diff
 * (report) and reconcile (apply) sides, so both pair children identically:
 *  - **Identified** elements match by `templateUuid` lineage (the source `uuid`) via `index`, guarded
 *    to the same tag: a placeholder `templateUuid` smeared across unrelated tags (real .ssd files
 *    reuse one dummy value on Substation, LNode, ...) can coincide with a source `uuid`; a cross-type
 *    hit is a collision, not a lineage.
 *  - A uuid-less **REFERENCE** (e.g. `FunctionRef`) matches by its reference IDENTITY — the target
 *    `*Uuid` it points to, mapped back to template space — never by tag position; with a name-space
 *    fallback for projects authored with placeholder `templateUuid`s. `refsAlwaysAdded` forces a fresh
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
 * The source side reads raw identities; the candidate (target) side is normalized to template space —
 * that role split is internal here, so callers never pass a space/`mapToTemplate` flag.
 */
export async function matchChild(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		instanceParent: AnyTreeRecord
		index: Map<string, AnyTreeRecord>
		matchedInstanceIds: ReadonlySet<string>
		refsAlwaysAdded?: boolean
		redirectedSourceUuids?: RedirectedSourceUuids
		matchContainersByName?: boolean
		pinnedMatches?: PinnedMatches
	},
): Promise<AnyTreeRecord | undefined> {
	const { targetQuery, sourceChild, instanceParent, index, matchedInstanceIds } = params
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	// where this child lands was decided elsewhere: it is that element, or a new one
	if (params.pinnedMatches?.has(sourceChild.id)) {
		const instanceId = params.pinnedMatches.get(sourceChild.id)
		return instanceId
			? instanceParent.tree.find((instanceChild) => instanceChild.id === instanceId)
			: undefined
	}

	const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
	if (sourceUuid) {
		const matched = index.get(sourceUuid)
		if (matched && matched.tagName === sourceChild.tagName) return matched
		if (!params.matchContainersByName) return undefined
		return findSameNameChild(sourceQuery, {
			targetQuery,
			sourceChild,
			instanceParent,
			matchedInstanceIds,
		})
	}

	// INSTANTIATE: a fresh instantiation creates its OWN per-instance refs, so never match a link to a
	// prior instance's ref — surface it as `added` (the prior refs stay as kept context).
	if (refsAlwaysAdded && REFERENCE_TAG_NAMES.has(sourceChild.tagName)) return undefined

	const candidates = instanceParent.tree.filter(
		(instanceChild) =>
			instanceChild.tagName === sourceChild.tagName && !matchedInstanceIds.has(instanceChild.id),
	)
	if (candidates.length === 0) return undefined

	if (REFERENCE_TAG_NAMES.has(sourceChild.tagName)) {
		// The source ref's target uuid is already TEMPLATE space (do not normalize it — an extracted
		// template may carry its own `templateUuid`). The candidate ref's target uuid is mapped back to
		// template space via its element's `templateUuid` so the two compare equal.
		const sourceIdentity = await referenceIdentity(sourceQuery, sourceChild, {
			mapToTemplate: false,
		})
		if (sourceIdentity === undefined) return candidates[0]
		for (const candidate of candidates) {
			const candidateIdentity = await referenceIdentity(targetQuery, candidate, {
				mapToTemplate: true,
				redirectedSourceUuids: params.redirectedSourceUuids,
			})
			if (candidateIdentity === sourceIdentity) return candidate
		}
		// Fallback: the uuid round-trip fails when a project was authored with PLACEHOLDER
		// `templateUuid`s that are not the source element's own `uuid`. Match instead by the resolved
		// TARGET NAME, which is stable across instantiate.
		const sourceNameIdentity = await referenceNameIdentity(sourceQuery, sourceChild)
		if (sourceNameIdentity === undefined) return undefined
		for (const candidate of candidates) {
			const candidateNameIdentity = await referenceNameIdentity(targetQuery, candidate)
			if (candidateNameIdentity === sourceNameIdentity) return candidate
		}
		return undefined
	}

	return candidates[0]
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
		if (instanceChild.tagName !== sourceChild.tagName) continue
		if (matchedInstanceIds.has(instanceChild.id)) continue
		const instanceName = await targetQuery.any.getAttribute(instanceChild, { name: 'name' })
		if (instanceName === name) return instanceChild
	}
	return undefined
}
