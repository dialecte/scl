import { referenceIdentity, referenceNameIdentity } from './reference-match'

import { REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'

import type { Config } from '@/v2019C1/config'
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
 *    `*Uuid` it points to, mapped back to template space — never by tag position; with a name-space
 *    fallback for projects authored with placeholder `templateUuid`s. `refsAlwaysAdded` forces a fresh
 *    instantiation's refs to surface as `added` instead of matching a prior instance's ref.
 *  - Any other uuid-less element (e.g. `FunctionRoleContent`) matches a same-tag sibling by position.
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
	},
): Promise<AnyTreeRecord | undefined> {
	const { targetQuery, sourceChild, instanceParent, index, matchedInstanceIds } = params
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
	if (sourceUuid) {
		const matched = index.get(sourceUuid)
		return matched && matched.tagName === sourceChild.tagName ? matched : undefined
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
