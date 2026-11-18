import { instanceTagOf } from './instance-tag'
import { createPairingMemo } from './pairing-memo'
import {
	placeholderLineageOf,
	referenceIdentity,
	referenceNameIdentity,
	tupleNamesIdentity,
} from './reference-match'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { keyFieldsOf } from '@/v2019C1/extensions/identity/query/key-fields'
import {
	CONTENT_HOLDING_TUPLE_REFERRER_TAGS,
	DISPOSABLE_REFERENCE_TAGS,
	UUIDLESS_TUPLE_REFERRER_TAGS,
} from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'

import type { ChildMatch, PinnedMatches, ReferenceIdentityOf } from './match-child.types'
import type { PairingMemo } from './pairing-memo.types'
import type { PlaceholderLineages } from './placeholder-lineages.types'
import type { RedirectedSourceUuids } from './reference-match.types'
import type { TargetLineages } from './target-lineages.types'
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
 *  - A uuid-less **REFERENCE** (`DISPOSABLE_REFERENCE_TAGS`: e.g. `FunctionRef`, `FCDA`) matches by its reference IDENTITY — the target
 *    `*Uuid` it points to, brought back to the source by the scenario's key — never by tag position. Only where the
 *    project's target carries a placeholder lineage the consumer lets pair by name (`placeholderLineages`) does it
 *    fall back to the names of what both name (the match says so: `pairedByName`). `refsAlwaysAdded` forces a fresh
 *    instantiation's refs to surface as `added` instead of matching a prior instance's ref. A reference
 *    to a project element a source element was mapped onto reads as a reference to that source element
 *    (`redirectedSourceUuids`), whatever the two are named.
 *  - A tuple referrer with no uuid of its own (`UUIDLESS_TUPLE_REFERRER_TAGS`: `FCDA`, `ClientLN`, `IEDName`,
 *    `ConnectedAP`, ...) matches as a reference does, by what its uuid names, with what tells apart two naming the same
 *    target (`REFERRER_DISCRIMINATORS`: the data a data set entry selects); one naming nothing by uuid, or with no
 *    sibling naming the same element, matches the sibling naming nothing by uuid that gives the same names (an
 *    `IEDName`'s text among them), never one by position. Siblings naming the very same thing are paired in order, the
 *    match says so (`pairedAmongTwins`).
 *  - A uuid-pair reference naming nothing by uuid matches by its key (`keyFieldsOf`: a data object's name), else by the
 *    path it writes, among siblings naming nothing by uuid; never by position.
 *  - Any other uuid-less element matches the sibling of the same key (`keyFieldsOf`: the schema's identity fields, else
 *    a supplement — a `DAI`'s name, a `Val`'s setting group); none of that key: no match (the source's is new, the
 *    instance's the project's own). Twins (the same key twice) are paired in order and said so. An element with no key
 *    of its own (a singleton such as `Server`) is the one there is, else the next in order.
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
		/** The lineage of what the candidates name, read once for the walk: see `readTargetLineages`. */
		targetLineages: TargetLineages
		refsAlwaysAdded?: boolean
		redirectedSourceUuids?: RedirectedSourceUuids
		matchContainersByName?: boolean
		pinnedMatches?: PinnedMatches
		/** The key each pinned source child was paired on by the key pass (`pairByKeyOnLineageMiss`), by its record id. */
		keyPairings?: ReadonlyMap<string, string>
		foreignInstanceIds?: ReadonlySet<string>
		/** The lineages a reference of the project may pair by name on: see `PlaceholderLineages`. Default none. */
		placeholderLineages?: PlaceholderLineages
		/** The source is the project itself (a copy): a uuid both name is one element, never a reference this walk wrote. */
		sourceIsProject: boolean
		/**
		 * What was read of `instanceParent`'s children while its earlier source children were paired: pass the same memo
		 * for every child of one parent (`createPairingMemo`). Default: a memo of this call alone.
		 */
		pairingMemo?: PairingMemo
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, instanceParent, index, matchedInstanceIds } = params
	const memo = params.pairingMemo ?? createPairingMemo()
	const refsAlwaysAdded = params.refsAlwaysAdded ?? false

	// where this child lands was decided elsewhere: it is that element, or a new one
	if (params.pinnedMatches?.has(sourceChild.id)) {
		const instanceId = params.pinnedMatches.get(sourceChild.id)
		const pinned = instanceId
			? instanceParent.tree.find((instanceChild) => instanceChild.id === instanceId)
			: undefined
		const key = params.keyPairings?.get(sourceChild.id)
		if (!pinned) return undefined
		return key === undefined ? { record: pinned } : { record: pinned, pairedByKey: key }
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
			memo,
		})
		return sameName && { record: sameName }
	}

	const siblings = instanceParent.tree.filter(
		(instanceChild) =>
			instanceChild.tagName === instanceTag && !params.foreignInstanceIds?.has(instanceChild.id),
	)
	const candidates = siblings.filter((instanceChild) => !matchedInstanceIds.has(instanceChild.id))
	if (candidates.length === 0) return undefined

	// a fresh placement makes its OWN references: one matches only a child already naming, in the project, the very
	// element it names (a source element mapped onto it) — never a prior instance's reference
	const pairedAsReference =
		DISPOSABLE_REFERENCE_TAGS.has(sourceChild.tagName) ||
		CONTENT_HOLDING_TUPLE_REFERRER_TAGS.has(sourceChild.tagName)
	if (refsAlwaysAdded && pairedAsReference) {
		return matchReferenceNamingTheSame(sourceQuery, {
			targetQuery,
			sourceChild,
			candidates,
			redirectedSourceUuids: params.redirectedSourceUuids,
			sourceIsProject: params.sourceIsProject,
			memo,
		})
	}

	if (pairedAsReference) {
		return matchReferenceByIdentity(sourceQuery, {
			targetQuery,
			sourceChild,
			siblings,
			candidates,
			matchKey: params.matchKey,
			redirectedSourceUuids: params.redirectedSourceUuids,
			targetLineages: params.targetLineages,
			placeholderLineages: params.placeholderLineages ?? new Set(),
			memo,
		})
	}

	// an element with no key of its own is the one there is, else the next in order
	if (keyFieldsOf(instanceTag).length === 0) return { record: candidates[0] }
	return matchByKey(sourceQuery, { targetQuery, sourceChild, siblings, candidates, memo })
}

/**
 * The candidate whose key (`keyFieldsOf`: the schema's identity fields, else a supplement) is the source child's,
 * the first in order: none when no candidate has it — the source child is then new, the candidates the project's own.
 * Several siblings with that key (paired or not) are twins: paired in order, the match says so (`pairedAmongTwins`).
 */
async function matchByKey(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		siblings: readonly AnyTreeRecord[]
		candidates: readonly AnyTreeRecord[]
		memo: PairingMemo
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, siblings, candidates, memo } = params
	const sourceKey = await keyOf(sourceQuery, { record: sourceChild })
	function instanceKeyOf(candidate: AnyTreeRecord): Promise<string | undefined> {
		return memo.read({
			kind: 'key',
			record: candidate,
			read: function readKey() {
				return keyOf(targetQuery, { record: candidate })
			},
		})
	}
	const record = await firstOfIdentity({
		candidates,
		identity: sourceKey,
		identityOf: instanceKeyOf,
	})
	return record && withTwins({ record, siblings, keyOf: instanceKeyOf })
}

/** An element's key as one string: each of its key fields `name=value`, an absent one empty. */
async function keyOf(reader: Reader, params: { record: AnyTreeRecord }): Promise<string> {
	const attributes = await reader.any.getAttributes(params.record)
	const fields = keyFieldsOf(instanceTagOf(params.record.tagName))
	return fields.map((field) => `${field}=${attributes[field] ?? ''}`).join('|')
}

/**
 * The candidate reference naming what the source reference names: by the uuids it names, brought back to the source by
 * the scenario's key; for a tuple referrer with no uuid of its own, else by the names it gives (see `matchChild`); else
 * by name on a placeholder lineage the consumer lets pair so.
 */
async function matchReferenceByIdentity(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		/** The instance children of the source child's tag, paired or not: what tells twins apart. */
		siblings: readonly AnyTreeRecord[]
		candidates: readonly AnyTreeRecord[]
		matchKey: MatchKey
		redirectedSourceUuids: RedirectedSourceUuids | undefined
		targetLineages: TargetLineages
		placeholderLineages: PlaceholderLineages
		memo: PairingMemo
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, siblings, candidates, matchKey, targetLineages, memo } = params
	const pairedByNames = UUIDLESS_TUPLE_REFERRER_TAGS.has(sourceChild.tagName)
	// The source ref's target uuid is read as it is (do not normalize it — an extracted template may
	// carry its own `templateUuid`). The candidate ref's target uuid is brought back to the source by
	// the scenario's key so the two compare equal.
	const sourceIdentity = await referenceIdentity(sourceQuery, sourceChild, { side: 'source' })
	if (sourceIdentity === undefined) {
		if (pairedByNames)
			return matchTupleNames(sourceQuery, { targetQuery, sourceChild, siblings, candidates, memo })
		// a reference naming nothing by uuid: by its key, else by the path it names
		if (keyFieldsOf(sourceChild.tagName).length > 0)
			return matchByKey(sourceQuery, { targetQuery, sourceChild, siblings, candidates, memo })
		return matchByPath(sourceQuery, { targetQuery, sourceChild, candidates, memo })
	}
	const byUuid = await firstOfIdentity({
		candidates,
		identity: sourceIdentity,
		identityOf: function instanceIdentityOf(candidate) {
			return memo.read({
				kind: 'instance',
				record: candidate,
				read: function readInstanceIdentity() {
					return referenceIdentity(targetQuery, candidate, {
						side: 'instance',
						matchKey,
						redirectedSourceUuids: params.redirectedSourceUuids,
						targetLineages,
					})
				},
			})
		},
	})
	if (byUuid) {
		if (!pairedByNames) return { record: byUuid }
		return withTwins({
			record: byUuid,
			siblings,
			// twins name the very same elements: their own uuids, not the template element those stand for
			keyOf: function ownIdentityOfSibling(sibling) {
				return ownIdentityOf(targetQuery, { candidate: sibling, memo })
			},
		})
	}
	// a reference of the project written without its uuid is the one giving the same names
	if (pairedByNames) {
		const namingNoUuid = await candidatesNamingNoUuid(targetQuery, { candidates, memo })
		const byNames = await matchTupleNames(sourceQuery, {
			targetQuery,
			sourceChild,
			siblings,
			candidates: namingNoUuid,
			memo,
		})
		if (byNames) return byNames
	}
	return matchReferenceByName(sourceQuery, {
		targetQuery,
		sourceChild,
		candidates,
		placeholderLineages: params.placeholderLineages,
		targetLineages,
		memo,
	})
}

/**
 * What a reference of the instance names itself, whatever the template element it stands for: the uuids it names (with
 * its discriminators), else, naming none, the names it gives. Two references are twins when this is equal.
 */
async function ownIdentityOf(
	targetQuery: Reader,
	params: { candidate: AnyTreeRecord; memo: PairingMemo },
): Promise<string | undefined> {
	const { candidate, memo } = params
	return memo.read({
		kind: 'own',
		record: candidate,
		read: async function readOwnIdentity() {
			const byUuid = await rawIdentityOf(targetQuery, { candidate, memo })
			return byUuid ?? namesIdentityOf(targetQuery, { candidate, memo })
		},
	})
}

/** The uuids a reference of the instance names, as written (with its discriminators): read once per parent. */
function rawIdentityOf(
	targetQuery: Reader,
	params: { candidate: AnyTreeRecord; memo: PairingMemo },
): Promise<string | undefined> {
	const { candidate } = params
	return params.memo.read({
		kind: 'raw',
		record: candidate,
		read: function readRawIdentity() {
			return referenceIdentity(targetQuery, candidate, { side: 'source' })
		},
	})
}

/** The names a reference of the instance gives what it names: read once per parent. */
function namesIdentityOf(
	targetQuery: Reader,
	params: { candidate: AnyTreeRecord; memo: PairingMemo },
): Promise<string | undefined> {
	const { candidate } = params
	return params.memo.read({
		kind: 'names',
		record: candidate,
		read: function readNamesIdentity() {
			return tupleNamesIdentity(targetQuery, candidate)
		},
	})
}

/** The first candidate, in document order, whose identity is `identity`: twins are paired in order. */
async function firstOfIdentity(params: {
	candidates: readonly AnyTreeRecord[]
	identity: string
	identityOf: ReferenceIdentityOf
}): Promise<AnyTreeRecord | undefined> {
	for (const candidate of params.candidates) {
		if ((await params.identityOf(candidate)) === params.identity) return candidate
	}
	return undefined
}

/**
 * The match of `record`, said paired among twins (`pairedAmongTwins`) when another sibling, paired or not, is the very
 * same thing (`keyOf`). Two references naming one element are twins only for a tuple referrer with no uuid of its
 * own: the callers ask only then.
 */
async function withTwins(params: {
	record: AnyTreeRecord
	siblings: readonly AnyTreeRecord[]
	keyOf: ReferenceIdentityOf
}): Promise<ChildMatch> {
	const { record, siblings, keyOf } = params
	const key = await keyOf(record)
	if (key === undefined) return { record }
	for (const sibling of siblings) {
		if (sibling.id !== record.id && (await keyOf(sibling)) === key)
			return { record, pairedAmongTwins: true }
	}
	return { record }
}

/**
 * The candidate reference naming the very element the source reference names: an element a source element was mapped
 * onto (`redirectedSourceUuids`), or — the same placement having written it already, not yet finalized — the source
 * element itself (never in a copy, where the source is the project). None for a reference an earlier placement made for
 * what it placed.
 */
async function matchReferenceNamingTheSame(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		candidates: readonly AnyTreeRecord[]
		redirectedSourceUuids: RedirectedSourceUuids | undefined
		sourceIsProject: boolean
		memo: PairingMemo
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, candidates, redirectedSourceUuids, sourceIsProject } = params
	const sourceIdentity = await referenceIdentity(sourceQuery, sourceChild, { side: 'source' })
	if (sourceIdentity === undefined) return undefined
	const record = await firstOfIdentity({
		candidates,
		identity: sourceIdentity,
		identityOf: function projectIdentityOf(candidate) {
			return params.memo.read({
				kind: 'project',
				record: candidate,
				read: function readProjectIdentity() {
					return referenceIdentity(targetQuery, candidate, {
						side: 'project',
						redirectedSourceUuids,
						readsSourceUuids: !sourceIsProject,
					})
				},
			})
		},
	})
	return record && { record }
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
		placeholderLineages: PlaceholderLineages
		targetLineages: TargetLineages
		memo: PairingMemo
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, candidates, placeholderLineages, memo } = params
	if (placeholderLineages.size === 0) return undefined
	const sourceNameIdentity = await referenceNameIdentity(sourceQuery, sourceChild)
	if (sourceNameIdentity === undefined) return undefined
	for (const candidate of candidates) {
		const placeholder = await memo.read({
			kind: 'placeholder',
			record: candidate,
			read: function readPlaceholder() {
				return placeholderLineageOf(targetQuery, candidate, {
					placeholderLineages,
					targetLineages: params.targetLineages,
				})
			},
		})
		if (!placeholder) continue
		const candidateNameIdentity = await memo.read({
			kind: 'reference-names',
			record: candidate,
			read: function readReferenceNames() {
				return referenceNameIdentity(targetQuery, candidate)
			},
		})
		if (candidateNameIdentity === sourceNameIdentity) {
			return { record: candidate, pairedByName: placeholder }
		}
	}
	return undefined
}

/** The candidate giving the same names as a tuple referrer naming nothing by uuid: none when it gives no name. */
async function matchTupleNames(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		siblings: readonly AnyTreeRecord[]
		candidates: readonly AnyTreeRecord[]
		memo: PairingMemo
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, memo } = params
	const sourceNames = await tupleNamesIdentity(sourceQuery, sourceChild)
	if (sourceNames === undefined) return undefined
	function namesOf(candidate: AnyTreeRecord): Promise<string | undefined> {
		return namesIdentityOf(targetQuery, { candidate, memo })
	}
	const byNames = await firstOfIdentity({
		candidates: params.candidates,
		identity: sourceNames,
		identityOf: namesOf,
	})
	return (
		byNames &&
		withTwins({
			record: byNames,
			siblings: params.siblings,
			keyOf: function ownIdentityOfSibling(sibling) {
				return ownIdentityOf(targetQuery, { candidate: sibling, memo })
			},
		})
	)
}

/**
 * The candidate naming nothing by uuid that writes the same path as a source reference naming nothing by uuid (a
 * function reference written by path only): the first in order; none when no candidate writes it.
 */
async function matchByPath(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		candidates: readonly AnyTreeRecord[]
		memo: PairingMemo
	},
): Promise<ChildMatch | undefined> {
	const { targetQuery, sourceChild, memo } = params
	const sourcePath = await pathOf(sourceQuery, { record: sourceChild })
	if (sourcePath === undefined) return undefined
	const namingNoUuid = await candidatesNamingNoUuid(targetQuery, {
		candidates: params.candidates,
		memo,
	})
	const record = await firstOfIdentity({
		candidates: namingNoUuid,
		identity: sourcePath,
		identityOf: function instancePathOf(candidate) {
			return memo.read({
				kind: 'path',
				record: candidate,
				read: function readPath() {
					return pathOf(targetQuery, { record: candidate })
				},
			})
		},
	})
	return record && { record }
}

/** The paths a uuid-pair reference writes, as one string: undefined when it writes none. */
async function pathOf(
	reader: Reader,
	params: { record: AnyTreeRecord },
): Promise<string | undefined> {
	const pairs =
		UUID_REFERENCE_PAIRS[params.record.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
	const attributes = await reader.any.getAttributes(params.record)
	const parts = pairs.flatMap((pair) => {
		const path = attributes[pair.attribute.path]
		return path ? [`${pair.attribute.path}=${path}`] : []
	})
	return parts.length > 0 ? parts.join('|') : undefined
}

/** The candidates naming nothing by uuid: only their names say what they name. */
async function candidatesNamingNoUuid(
	targetQuery: Reader,
	params: { candidates: readonly AnyTreeRecord[]; memo: PairingMemo },
): Promise<AnyTreeRecord[]> {
	const uuidless: AnyTreeRecord[] = []
	for (const candidate of params.candidates) {
		const identity = await rawIdentityOf(targetQuery, { candidate, memo: params.memo })
		if (identity === undefined) uuidless.push(candidate)
	}
	return uuidless
}

/** The not-yet-matched child of `instanceParent` with the tag and the name of `sourceChild`. */
async function findSameNameChild(
	sourceQuery: Reader,
	params: {
		targetQuery: Reader
		sourceChild: AnyTreeRecord
		instanceParent: AnyTreeRecord
		matchedInstanceIds: ReadonlySet<string>
		memo: PairingMemo
	},
): Promise<AnyTreeRecord | undefined> {
	const { targetQuery, sourceChild, instanceParent, matchedInstanceIds, memo } = params

	const name = await sourceQuery.any.getAttribute(sourceChild, { name: 'name' })
	if (!name) return undefined

	const instanceTag = instanceTagOf(sourceChild.tagName)
	const candidates = instanceParent.tree.filter(
		(instanceChild) =>
			instanceChild.tagName === instanceTag && !matchedInstanceIds.has(instanceChild.id),
	)
	return firstOfIdentity({
		candidates,
		identity: name,
		identityOf: function nameOf(candidate) {
			return memo.read({
				kind: 'name',
				record: candidate,
				read: function readName() {
					return targetQuery.any.getAttribute(candidate, { name: 'name' })
				},
			})
		},
	})
}
