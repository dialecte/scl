import { collectUuids } from './match-key'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'

import type {
	ClassifyUnmatchedParams,
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
			if (!baseQuery) return { kind: 'no-revision' }
			await assertSameFile({ sourceQuery, baseQuery })
			return { kind: 'revision', uuids: await collectDocumentUuids(baseQuery) }
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
	const { lineage, inSource, removalBase } = params
	if (inSource) return 'still-held'
	switch (removalBase.kind) {
		case 'lineage':
			return 'removed'
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

/** The uuid the Header of a document gives its file, if any. */
async function readFileUuid(query: Core.Query<Config>): Promise<string | undefined> {
	const [header] = await query.getRecordsByTagName('Header')
	if (!header) return undefined
	return (await query.getAttribute(header, { name: 'uuid' })) || undefined
}

/** Every uuid an element of a document carries. */
async function collectDocumentUuids(query: Core.Query<Config>): Promise<ReadonlySet<string>> {
	const uuids = new Set<string>()
	const [root] = await query.getRecordsByTagName('SCL')
	const tree = root ? await query.any.getTree(root) : undefined
	if (tree) await collectUuids(query, { node: tree, out: uuids })
	return uuids
}
