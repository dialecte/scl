import { collectUuids } from './match-key'
import { readUpdateHolds } from './reference-retargets'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { readFileUuid } from '@/v2019C1/extensions/lifecycle/read-file-uuid'
import { BARE_TUPLE_REFERRER_TAGS } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type { AcceptedIds } from './decide.types'
import type {
	ClassifyUnmatchedParams,
	ClassifyUnpairedReferenceParams,
	DroppedElement,
	RemovalBase,
	ResolveRemovalBaseParams,
	UnmatchedClass,
} from './removal-base.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What tells a dropped element from the project's own, for one report or apply — read once: the previous revision's
 * uuids are collected here, never per element. A previous revision whose Header names another file than the newer
 * revision's is refused: a wrong base never decides a removal. A newer revision whose Header names no file is not
 * checked: its elements' uuids are what it shares with its previous revision.
 */
export async function resolveRemovalBase(params: ResolveRemovalBaseParams): Promise<RemovalBase> {
	const { policy, sourceQuery, baseQuery } = params
	switch (policy.removalBase) {
		case 'none':
			return { kind: 'none' }
		case 'lineage':
			return { kind: 'lineage' }
		case 'revision': {
			// a fork of the file itself: what the update holds, the scope of its re-targets
			const holds = params.target
				? await readUpdateHolds({ sourceQuery, target: params.target, within: params.within })
				: undefined
			const forkHolds = holds ? { holds } : {}
			if (!baseQuery) return { kind: 'no-revision', ...forkHolds }
			await assertSameFile({ sourceQuery, baseQuery })
			return { kind: 'revision', uuids: await collectDocumentUuids(baseQuery), ...forkHolds }
		}
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `resolveRemovalBase: unhandled removal base ${String(policy.removalBase satisfies never)}`,
			})
	}
}

/**
 * Classify an element of the project that matched no source element. Every place that decides a removal — the
 * report's diff and the apply's reconcile, of an element and of a shared satellite — reads this one predicate, so the
 * report lists what the apply removes.
 */
export function classifyUnmatched(params: ClassifyUnmatchedParams): UnmatchedClass {
	const { tagName, lineage, inSource, removalBase } = params
	if (inSource) return 'still-held'
	switch (removalBase.kind) {
		case 'lineage':
			// a level's lineage names the template level it was made from, not the template that placed it: another
			// template placed in a level of the unit carries one too, so a level the template does not hold is kept
			// unless its removal is accepted
			return isTopologyLevel(tagName) ? 'target-only' : 'removed'
		case 'revision':
			return removalBase.uuids.has(lineage) ? 'removed' : 'target-only'
		case 'none':
		case 'no-revision':
			return 'target-only'
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `classifyUnmatched: unhandled removal base ${String(removalBase satisfies never)}`,
			})
	}
}

/**
 * Classify a reference of the project with no uuid of its own that no source reference pairs with, and that is not
 * another instance's link. The report's diff and the apply's reconcile both read it, so the report lists what the
 * apply removes:
 *  - an IED's data-flow reference (`BARE_TUPLE_REFERRER_TAGS`) is the project's own (`target-only`): nothing tells one
 *    the source dropped from one the project added, so it stays unless its removal is accepted;
 *  - any other (`FunctionRef`, `Terminal`, ...) is `removed`: the link goes when the source no longer holds it.
 */
export function classifyUnpairedReference(
	params: ClassifyUnpairedReferenceParams,
): Exclude<UnmatchedClass, 'still-held'> {
	return BARE_TUPLE_REFERRER_TAGS.has(params.tagName) ? 'target-only' : 'removed'
}

/**
 * Whether an apply removes an element the source no longer holds: a removal unless its group was skipped (every
 * removal when no gate is given), an element of the project's own only when its removal was accepted.
 */
export function acceptsRemoval(params: {
	change: Exclude<UnmatchedClass, 'still-held'>
	id: string
	accepted: AcceptedIds | undefined
}): boolean {
	const { change, id, accepted } = params
	switch (change) {
		case 'removed':
			return !accepted || accepted.instanceIds.has(id)
		case 'target-only':
			return accepted?.instanceIds.has(id) ?? false
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `acceptsRemoval: unhandled change ${String(change satisfies never)}`,
			})
	}
}

/** Remove the dropped elements the decisions accept (see {@link acceptsRemoval}), each once. */
export async function deleteDropped(
	tx: Core.Transaction<Config>,
	params: { dropped: readonly DroppedElement[]; accepted: AcceptedIds | undefined },
): Promise<void> {
	const { dropped, accepted } = params
	for (const { element, change } of dropped) {
		if (!acceptsRemoval({ change, id: element.id, accepted })) continue
		const live = await tx.any.getRecord(element)
		if (live) await tx.any.delete(element)
	}
}

/** Refuse a previous revision of another file: both Headers name their file, and the names differ. */
async function assertSameFile(params: {
	sourceQuery: Core.Query<Config>
	baseQuery: Core.Query<Config>
}): Promise<void> {
	const { sourceQuery, baseQuery } = params
	const fileUuid = await readFileUuid(sourceQuery)
	const baseFileUuid = await readFileUuid(baseQuery)
	if (!fileUuid || !baseFileUuid || fileUuid === baseFileUuid) return
	throwDialecteError(SCL_ERRORS.REVISION_BASE_OTHER_FILE, {
		meta: { fileUuid, baseFileUuid },
		detail: `the previous revision given names the file "${baseFileUuid}", the newer revision "${fileUuid}"`,
	})
}

/** Every uuid an element of a document carries. */
async function collectDocumentUuids(query: Core.Query<Config>): Promise<ReadonlySet<string>> {
	const uuids = new Set<string>()
	const [root] = await query.getRecordsByTagName('SCL')
	const tree = root ? await query.any.getTree(root) : undefined
	if (tree) await collectUuids(query, { node: tree, out: uuids })
	return uuids
}
