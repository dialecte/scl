import {
	UNUSED_TYPES_REFERRERS_PERF_SPAN,
	UNUSED_TYPES_RESOLVE_PERF_SPAN,
} from './unused-types.constants'

import {
	TYPE_ID_REF_ATTRIBUTES,
	TYPE_ID_REFERENCE_PAIRS,
	TYPE_ID_REFERRERS_BY_TARGET,
} from '@/v2019C1/extensions/reference'
import { readAttribute } from '@/v2019C1/helpers'
import { readSubtreeRecords } from '@/v2019C1/hooks/before-delete'

import type {
	LostTypeNames,
	NamesByTarget,
	PrunedTypeTree,
	TypeCandidate,
	TypeReads,
	UnusedTypes,
} from './unused-types.types'
import type { Config, Scl } from '@/v2019C1/config'
import type {
	TypeIdReferencePair,
	TypeIdRefTagName,
	TypeIdTarget,
} from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * The type names the operations stopped naming: per record id, the type-id attributes of its first `oldRecord`
 * minus those of its last `newRecord`. A record created then deleted lost nothing; a name changed away and back lost nothing.
 */
export function lostTypeNames(operations: ReadonlyArray<Scl.Operation>): LostTypeNames {
	const before = new Map<string, Scl.RawRecord<Scl.ElementsOf> | undefined>()
	const after = new Map<string, Scl.RawRecord<Scl.ElementsOf> | undefined>()
	for (const operation of operations) {
		const { id } = operation.status === 'deleted' ? operation.oldRecord : operation.newRecord
		if (!before.has(id)) before.set(id, operation.oldRecord)
		after.set(id, operation.newRecord)
	}

	const lost: NamesByTarget = new Map()
	for (const [id, oldRecord] of before) {
		if (!oldRecord) continue
		const kept = namesOf(after.get(id))
		for (const [name, targets] of namesOf(oldRecord)) {
			if (!kept.has(name)) addNames({ names: lost, targets, name })
		}
	}
	return namesToLost(lost)
}

/**
 * The types among `names` nothing in the document names any more (a referrer whose record id is in `gone` does not
 * count), then, round after round, the types they alone named, each with every record of its subtree.
 */
export async function collectUnusedTypes(params: {
	query: Core.Query<Config>
	names: LostTypeNames
	gone: ReadonlySet<string>
	/** The reads to use, shared between calls on a document that does not change meanwhile (a report); default: new ones. */
	reads?: TypeReads
}): Promise<UnusedTypes> {
	const { query, names } = params
	const goneIds = new Set(params.gone)
	const reads = params.reads ?? createTypeReads(query)
	const trees: PrunedTypeTree[] = []

	let judged = lostToNames(names)
	while (judged.size > 0) {
		const unused = await findUnusedTypes({ reads, judged, goneIds })
		if (unused.length === 0) break
		const subtree = await readSubtreeRecords(query, { records: unused })
		const round = groupByRoot({ roots: unused, subtree })
		const named: NamesByTarget = new Map()
		for (const tree of round) {
			trees.push(tree)
			for (const record of tree.records) {
				goneIds.add(record.id)
				for (const [name, targets] of namesOf(record)) addNames({ names: named, targets, name })
			}
		}
		// the types a pruned type named are judged again: one a type pruned in this round alone kept goes now
		judged = named
	}
	return { trees, gone: goneIds }
}

/** Reads that remember each tag they read: valid while the document does not change (one pass, or one report). */
export function createTypeReads(query: Core.Query<Config>): TypeReads {
	return { query, byTag: new Map() }
}

// ── The names a record carries ──────────────────────────────────────────────────────

/** The type names a record holds, each with the tags of type that may carry it (`when` ignored). */
function namesOf(
	record: Scl.RawRecord<Scl.ElementsOf> | undefined,
): Map<string, Set<TypeIdTarget>> {
	const names = new Map<string, Set<TypeIdTarget>>()
	const attributes = record ? TYPE_ID_REF_ATTRIBUTES.get(record.tagName) : undefined
	if (!record || !attributes) return names
	const pairs = TYPE_ID_REFERENCE_PAIRS[
		record.tagName as TypeIdRefTagName
	] as readonly TypeIdReferencePair[]
	for (const attribute of attributes) {
		const name = readAttribute({ record, name: attribute, defaults: 'none' })
		if (!name) continue
		const targets = names.get(name) ?? new Set<TypeIdTarget>()
		for (const pair of pairs) if (pair.attribute === attribute) targets.add(pair.target)
		names.set(name, targets)
	}
	return names
}

function addNames(params: {
	names: NamesByTarget
	targets: ReadonlySet<TypeIdTarget>
	name: string
}): void {
	const { names, targets, name } = params
	for (const target of targets) {
		const known = names.get(target) ?? new Set<string>()
		known.add(name)
		names.set(target, known)
	}
}

/** Names per tag of type, as the lost names the other way round. */
function namesToLost(names: NamesByTarget): LostTypeNames {
	const lost = new Map<string, TypeIdTarget[]>()
	for (const [target, targetNames] of names) {
		for (const name of targetNames) lost.set(name, [...(lost.get(name) ?? []), target])
	}
	return lost
}

function lostToNames(lost: LostTypeNames): NamesByTarget {
	const names: NamesByTarget = new Map()
	for (const [name, targets] of lost) addNames({ names, targets: new Set(targets), name })
	return names
}

// ── One round ───────────────────────────────────────────────────────────────────────

/** The types of `judged` that exist and that no record still there names. */
async function findUnusedTypes(params: {
	reads: TypeReads
	judged: NamesByTarget
	goneIds: ReadonlySet<string>
}): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { reads, judged, goneIds } = params
	const { perf } = reads.query

	perf.start(UNUSED_TYPES_RESOLVE_PERF_SPAN)
	let candidates: TypeCandidate[]
	try {
		candidates = await resolveTypes({ reads, judged, goneIds })
	} finally {
		perf.stop(UNUSED_TYPES_RESOLVE_PERF_SPAN)
	}
	if (candidates.length === 0) return []

	perf.start(UNUSED_TYPES_REFERRERS_PERF_SPAN)
	let named: NamesByTarget
	try {
		named = await readNamedTypes({ reads, candidates, goneIds })
	} finally {
		perf.stop(UNUSED_TYPES_REFERRERS_PERF_SPAN)
	}
	return candidates
		.filter(({ record, typeId }) => !named.get(record.tagName as TypeIdTarget)?.has(typeId))
		.map(({ record }) => record)
}

/** The records of the types `judged` names, by tag of type and id; one already gone is not read again. */
async function resolveTypes(params: {
	reads: TypeReads
	judged: NamesByTarget
	goneIds: ReadonlySet<string>
}): Promise<TypeCandidate[]> {
	const { reads, judged, goneIds } = params
	const candidates: TypeCandidate[] = []
	for (const [target, names] of judged) {
		for (const record of await readByTag({ reads, tagName: target })) {
			if (goneIds.has(record.id)) continue
			const typeId = readAttribute({ record, name: 'id', defaults: 'none' })
			if (typeId && names.has(typeId)) candidates.push({ record, typeId })
		}
	}
	return candidates
}

/**
 * The ids of the candidates that a record still there names, per tag of type: each referrer tag is read once for the
 * pass, a record in `gone` does not count, and the referrer's `when` is ignored (the schema's key reference has none).
 */
async function readNamedTypes(params: {
	reads: TypeReads
	candidates: readonly TypeCandidate[]
	goneIds: ReadonlySet<string>
}): Promise<NamesByTarget> {
	const { reads, candidates, goneIds } = params
	const judged: NamesByTarget = new Map()
	for (const { record, typeId } of candidates) {
		addNames({ names: judged, targets: new Set([record.tagName as TypeIdTarget]), name: typeId })
	}

	const named: NamesByTarget = new Map()
	for (const [target, ids] of judged) {
		for (const referrer of TYPE_ID_REFERRERS_BY_TARGET.get(target) ?? []) {
			for (const record of await readByTag({ reads, tagName: referrer.refTagName })) {
				if (goneIds.has(record.id)) continue
				const name = readAttribute({ record, name: referrer.attribute, defaults: 'none' })
				if (name && ids.has(name)) addNames({ names: named, targets: new Set([target]), name })
			}
		}
	}
	return named
}

/** Every record of a tag, read once for the pass. */
function readByTag(params: {
	reads: TypeReads
	tagName: string
}): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { reads, tagName } = params
	const known = reads.byTag.get(tagName)
	if (known) return known
	const read = reads.query.getRecordsByTagName(tagName as Scl.ElementsOf)
	reads.byTag.set(tagName, read)
	return read
}

/** The subtree records of each root, root first: a record belongs to the root whose children reach it. */
function groupByRoot(params: {
	roots: readonly Scl.TrackedRecord<Scl.ElementsOf>[]
	subtree: readonly Scl.RawRecord<Scl.ElementsOf>[]
}): PrunedTypeTree[] {
	const { roots, subtree } = params
	const trees = new Map<string, PrunedTypeTree>()
	const rootOf = new Map<string, string>()
	for (const root of roots) {
		trees.set(root.id, { root, records: [] })
		rootOf.set(root.id, root.id)
	}
	// read level by level, roots first: a record's root is known when its turn comes
	for (const record of subtree) {
		const rootId = rootOf.get(record.id)
		if (rootId === undefined) continue
		trees.get(rootId)?.records.push(record)
		for (const child of record.children) {
			if (!rootOf.has(child.id)) rootOf.set(child.id, rootId)
		}
	}
	return [...trees.values()]
}
