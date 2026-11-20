import { resolve } from '../query'
import { collectUnusedTypes } from '../query/unused-types'
import { TYPE_TAGS } from './import-types.constants'

import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'
import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'
import { applyTypeIdRemap } from '@/v2019C1/extensions/reference/transaction'
import { elementSignature } from '@/v2019C1/extensions/signature/query'
import { readAttribute } from '@/v2019C1/helpers'

import type { ResolvedDataModel } from '../query/resolve.types'
import type { LostTypeNames } from '../query/unused-types.types'
import type {
	ImportTypesParams,
	ImportTypesResult,
	ImportTypesStats,
	ReusedFork,
	SignedSourceType,
	TargetTypes,
	TypeFollower,
	TypeRecord,
} from './import-types.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TypeIdReferencePair, TypeIdTarget } from '@/v2019C1/extensions/reference'
import type { ReferenceCache } from '@/v2019C1/extensions/signature/query/element-signature.types'
import type * as Core from '@dialecte/core'

/** A fork that displaced a pre-existing target type under the same id. */
type Collision = {
	/** The SCL `id` the fork collided with (and may reclaim). */
	oldId: string
	/** The displaced pre-existing target type record. */
	oldRef: Scl.Ref<Scl.ElementsOf>
	/** The freshly-cloned fork record (its own id is `forkedId`). */
	forkRef: Scl.Ref<Scl.ElementsOf>
	/** The SCL `id` the fork was minted under (`<forkPrefix><oldId>_<hash>`). */
	forkedId: string
}

export type {
	ImportTypesParams,
	ImportTypesResult,
	ImportTypesStats,
	KeepNameTypesFrom,
	LogicalNodeRecord,
	TypeFollower,
} from './import-types.types'

/**
 * Import the type closure of `records` into the target `DataTypeTemplates`,
 * content-addressed: an equal type is reused, a free id is kept, a taken id is forked.
 *
 * For each type, bottom-up:
 *
 * - **R1** structurally-equal type already in the target → reuse its id (dedup);
 * - **R2** no match and the source id is free → clone, preserving the id;
 * - **R3** no match but the id is taken by different content → fork under a new
 *   content-hash id (`<forkPrefix><id>_<hash>`) and propagate the fork upward; then,
 *   if the displaced target type is left with **no** file-wide referrers (an update
 *   whose old version is no longer consumed), prune that orphan and reclaim its id
 *   for the fork. Pruning is refcount-based and cascades to descendants only where
 *   their own referrer count hits zero, so a child type still shared elsewhere keeps
 *   its fork.
 *
 * Child type references inside the imported types — and the `lnType` of the
 * instances in `cloneMappings` (the caller's instance clone) — are repointed to
 * the reconciled ids in the same transaction. With an empty / non-colliding
 * target and no `cloneMappings` this is byte-identical to a plain id-preserving
 * clone.
 *
 * Each of the `followers` (a logical node of the target matched to one of the
 * source) is pointed at the id its source's type resolves to; the type it leaves
 * joins the pruned ones when nothing names it any more, and, in a call with
 * followers, a fork reused for a source type takes the source id back once it is
 * free — so a type only the followers named is updated in place, one anything
 * else names is forked.
 *
 * @intent copy data types (LNodeType/DOType/DAType/EnumType) into another document, import a type closure with dedup and id collision handling, merge DataTypeTemplates
 */
export async function importTypes(
	tx: Core.Transaction<Config>,
	params: ImportTypesParams,
): Promise<ImportTypesResult> {
	const {
		sourceQuery,
		records,
		cloneMappings = [],
		followers = [],
		forkPrefix = '',
		keepNameTypesFrom = 'target',
	} = params

	tx.perf.start('scl::importTypes')

	// a follower's source brings its closure as any record does
	const resolved = await resolve(sourceQuery, {
		records: [...records, ...followers.map((follower) => follower.source)],
	})
	const sourceTypes = await collectTypesBottomUp(sourceQuery, { resolved })

	// written with the first type cloned: a closure the target already holds, or none, leaves no empty section
	let dataTypeTemplates: Scl.RawRecord<'DataTypeTemplates'> | undefined

	// The source loop is the heavy phase — size the bar to it (one step per type).
	// The cheap remap/reclaim tail still captions via nextStep; those extra steps
	// clamp the bar at 100% (harmless). The pre-existing index runs first under the
	// initial caption without its own steps.
	tx.progress.plan({ steps: sourceTypes.length, label: 'Indexing existing types…' })

	// Dedup only against the types that already existed in the target (never
	// against types we mint during this run).
	tx.perf.start('scl::importTypes::preExistingIndex')
	const preExisting = await buildPreExistingSignatureIndex(tx)
	tx.perf.stop('scl::importTypes::preExistingIndex')

	// the records of each clone, by the id of its root: what is repointed and reclaimed after the loop
	const cloneRecords = new Map<string, Scl.Ref<Scl.ElementsOf>[]>()

	const idRemap = new Map<string, string>()
	const clonedRoots: Scl.Ref<Scl.ElementsOf>[] = []
	const collisions: Collision[] = []
	const reusedForks: ReusedFork[] = []
	const stats: ImportTypesStats = { reused: 0, preserved: 0, forked: 0, reclaimed: 0 }

	// One signature cache for the whole source loop: a descendant type shared by
	// many top-level types is computed once, not re-walked per top-level type.
	const sourceSignatureCache = new Map<string, string>()

	tx.perf.start('scl::importTypes::sourceLoop')

	// First step, the lookups: each source type signed (the source read only), then the target types holding the ids of
	// those no equal type reuses looked up, one lookup per type tag. The loop keeps them up to date with the types it
	// clones and renames, so each id is answered as a lookup at that point would answer it.
	const signed = await signSourceTypes({
		sourceQuery,
		sourceTypes,
		signatureCache: sourceSignatureCache,
	})
	const targetTypes = await createTargetTypes(tx, { signed, preExisting })

	// Second step, the trees: each type reused, or its source tree cloned.
	for (const { source, sourceId, signature } of signed) {
		// One step per source type; the caption rides the advance (close-previous).
		tx.progress.nextStep(sourceId ? `Importing ${sourceId}` : undefined)
		if (!sourceId || signature === undefined) continue

		const reusedId = preExisting.get(signature)
		if (reusedId !== undefined) {
			const survivingId =
				keepNameTypesFrom === 'source'
					? await adoptIncomingName(tx, {
							tagName: source.tagName,
							currentId: reusedId,
							desiredId: sourceId,
						})
					: reusedId
			if (survivingId !== reusedId) {
				targetTypes.renamed({ tagName: source.tagName, from: reusedId, to: survivingId })
			}
			idRemap.set(sourceId, survivingId)
			// Keep the dedup index consistent so a later incoming type sharing this
			// signature reuses the renamed (surviving) id, not the vanished old one.
			if (survivingId !== reusedId) preExisting.set(signature, survivingId)
			// for followers, a fork an earlier import minted for this very content (the instances of one template followed
			// one after the other) takes the source id back once it is free
			if (followers.length > 0 && survivingId === forkIdOf({ forkPrefix, sourceId, signature })) {
				reusedForks.push({ tagName: source.tagName, sourceId, forkId: survivingId })
			}
			stats.reused++
			continue
		}

		const tree = await sourceQuery.getTree(source)
		if (!tree) continue

		const existing = await targetTypes.find({ tagName: source.tagName, id: sourceId })

		let targetId = sourceId
		let preparedTree = tree
		if (existing) {
			targetId = await freeForkId(tx, source.tagName, forkIdOf({ forkPrefix, sourceId, signature }))
			preparedTree = withRootId(tree, targetId)
			stats.forked++
		} else {
			stats.preserved++
		}

		dataTypeTemplates ??= await ensureDataTypeTemplates(tx)
		const clone = await tx.deepClone(dataTypeTemplates, preparedTree)
		idRemap.set(sourceId, targetId)
		if (clone?.record) {
			const cloneRef = toRef(clone.record.tagName, clone.record.id)
			clonedRoots.push(cloneRef)
			cloneRecords.set(
				clone.record.id,
				clone.mappings.map(function targetOf(mapping) {
					return mapping.target as Scl.Ref<Scl.ElementsOf>
				}),
			)
			targetTypes.cloned({ tagName: source.tagName, id: targetId, ref: cloneRef })
			if (existing) {
				collisions.push({
					oldId: sourceId,
					oldRef: existing,
					forkRef: toRef(clone.record.tagName, clone.record.id),
					forkedId: targetId,
				})
			}
		}
	}
	tx.perf.stop('scl::importTypes::sourceLoop')

	// Second pass: now that idRemap is complete, repoint the child type-refs of
	// every cloned type and the `lnType` of the cloned instances (clone mappings) —
	// a clone bound to an IED too: a clone is never an implementation of the target,
	// it takes the type its source names.
	tx.perf.start('scl::importTypes::remap')
	const recordsToRemap: Scl.Ref<Scl.ElementsOf>[] = cloneMappings.map((mapping) => mapping.target)
	for (const root of clonedRoots) {
		tx.progress.nextStep('Repointing references…')
		recordsToRemap.push(...(cloneRecords.get(root.id ?? '') ?? []))
	}
	await applyTypeIdRemap(tx, { records: recordsToRemap, idRemap })
	const leftTypes = await retargetFollowers(tx, { followers, idRemap })
	tx.perf.stop('scl::importTypes::remap')

	// Third pass: reclaim the ids of types a fork superseded, when the displaced old
	// type is left with no file-wide referrers — and prune the types the followers
	// left that nothing names any more.
	if (collisions.length > 0 || leftTypes.size > 0) {
		tx.progress.nextStep('Reclaiming ids…')
		tx.perf.start('scl::importTypes::reclaim')
		await reclaimSupersededTypes(tx, {
			collisions,
			leftTypes,
			idRemap,
			referrerRecords: [...recordsToRemap, ...followers.map((follower) => follower.target)],
			cloneRecords,
			stats,
		})
		tx.perf.stop('scl::importTypes::reclaim')
	}
	await reclaimReusedForks(tx, { reusedForks, idRemap, stats })

	tx.progress.endPlan()
	// Best-effort dev span: only the success path stops it; a throw aborts the
	// transaction and simply leaves no measure (report reads measures, not marks).
	tx.perf.stop('scl::importTypes')
	return { idRemap, stats }
}

/** The target's `DataTypeTemplates`, created when it has none. */
async function ensureDataTypeTemplates(
	tx: Core.Transaction<Config>,
): Promise<Scl.RawRecord<'DataTypeTemplates'>> {
	const root = await tx.getRoot()
	return tx.ensureChild(root, { tagName: 'DataTypeTemplates', attributes: {} })
}

// ── Internals ───────────────────────────────────────────────────────────────────

/**
 * Bottom-up so a type's children are reconciled before the parent references them; each kind in the order of the
 * source `DataTypeTemplates`, so the target holds them in that order whatever order the records were read in.
 */
async function collectTypesBottomUp(
	query: Core.Query<Config>,
	params: { resolved: ResolvedDataModel },
): Promise<TypeRecord[]> {
	const { resolved } = params
	const kinds: TypeRecord[][] = [
		resolved.enumTypes,
		resolved.daTypes,
		resolved.doTypes,
		resolved.lnodeTypes,
	]
	const positions = await readSourcePositions(query, { types: kinds.flat() })
	return kinds.flatMap(function inSourceOrder(kind) {
		return [...kind].sort(
			(first, second) => (positions.get(first.id) ?? 0) - (positions.get(second.id) ?? 0),
		)
	})
}

/**
 * The index of each type among the children of its `DataTypeTemplates` (one per document), each container read once.
 */
async function readSourcePositions(
	query: Core.Query<Config>,
	params: { types: readonly TypeRecord[] },
): Promise<Map<string, number>> {
	const containerRefs = new Map<string, Scl.Ref<Scl.ElementsOf>>()
	for (const type of params.types) {
		if (type.parent) containerRefs.set(type.parent.id, type.parent)
	}
	const containers = await query.getRecords([...containerRefs.values()])
	const positions = new Map<string, number>()
	for (const container of containers) {
		container?.children.forEach((child, index) => positions.set(child.id, index))
	}
	return positions
}

/** signature -> id of the types already present in the target, first occurrence wins. */
async function buildPreExistingSignatureIndex(
	tx: Core.Transaction<Config>,
): Promise<Map<string, string>> {
	const index = new Map<string, string>()
	// One signature cache across every pre-existing target type, same rationale as
	// the source loop: shared descendants are signed once.
	const signatureCache = new Map<string, string>()
	// the elements the types' references name, looked up once for the whole index: no write runs while it is built
	const referenceCache: ReferenceCache = new Map()
	for (const tagName of TYPE_TAGS) {
		const existing = await tx.getRecordsByTagName(tagName)
		for (const record of existing) {
			const id = readAttribute({ record, name: 'id' })
			if (!id) continue
			const signature = await elementSignature(tx, {
				ref: { tagName, id: record.id },
				resolveReferences: true,
				signatureCache,
				referenceCache,
			})
			if (!index.has(signature)) index.set(signature, id)
		}
	}
	return index
}

/**
 * Adopt the incoming id for a reused (deduped) target type so the incoming file
 * stays the naming authority (`keepNameTypesFrom: 'source'`): rename the pre-existing
 * target type to `desiredId` and repoint the target's existing referrers to
 * follow. Returns the surviving id. Falls back to `currentId` (current behavior)
 * when the rename is a no-op (ids already equal), the record vanished, or
 * `desiredId` is already taken by a different type (invariant: one type per id).
 */
async function adoptIncomingName(
	tx: Core.Transaction<Config>,
	params: { tagName: TypeRecord['tagName']; currentId: string; desiredId: string },
): Promise<string> {
	const { tagName, currentId, desiredId } = params
	if (currentId === desiredId) return currentId

	const [reusedRecord] = await tx.findByAttributes({ tagName, attributes: { id: currentId } })
	if (!reusedRecord) return currentId

	const [occupant] = await tx.findByAttributes({ tagName, attributes: { id: desiredId } })
	if (occupant && occupant.id !== reusedRecord.id) return currentId

	const reusedRef = toRef(reusedRecord.tagName, reusedRecord.id)
	// Collect referrers before the rename (they still hold `currentId`), then rewrite.
	const referrers = await findRefsPointingTo(tx, { target: reusedRef })
	await tx.update(reusedRef, { attributes: { id: desiredId } })
	await applyTypeIdRemap(tx, {
		records: referrers.map((r) => toRef(r.ref.tagName, r.ref.id)),
		idRemap: new Map([[currentId, desiredId]]),
	})
	return desiredId
}

function withRootId<GenericElement extends Scl.ElementsOf>(
	tree: Scl.TreeRecord<GenericElement>,
	newId: string,
): Scl.TreeRecord<GenericElement> {
	const clone = structuredClone(tree)
	const attributes = clone.attributes as { name: string; value: string }[]
	const idAttribute = attributes.find((a) => a.name === 'id')
	if (idAttribute) idAttribute.value = newId
	else attributes.push({ name: 'id', value: newId })
	return clone
}

/** Each source type with its id and, when it has one, its signature (the source read only, one cache for all). */
async function signSourceTypes(params: {
	sourceQuery: Core.Query<Config>
	sourceTypes: readonly TypeRecord[]
	signatureCache: Map<string, string>
}): Promise<SignedSourceType[]> {
	const { sourceQuery } = params
	const signed: SignedSourceType[] = []
	// the elements the source types' references name, looked up once for all of them (the source is only read)
	const referenceCache: ReferenceCache = new Map()
	for (const source of params.sourceTypes) {
		// dialecte-allow query-in-loop: the attribute of a record held, read as given (no store read), one per source type as before
		const sourceId = await sourceQuery.getAttribute(source, { name: 'id' })
		const signature = sourceId
			? await elementSignature(sourceQuery, {
					ref: { tagName: source.tagName, id: source.id },
					resolveReferences: true,
					signatureCache: params.signatureCache,
					referenceCache,
				})
			: undefined
		signed.push({ source, sourceId, signature })
	}
	return signed
}

/**
 * The target types holding the ids of the source types no equal target type reuses: one lookup per type tag over all
 * its ids before the loop, then told of the types the loop clones and renames. An id the lookup found on several types,
 * never asked, or the old or new id of a rename, is looked up alone where it is asked, as before.
 */
async function createTargetTypes(
	tx: Core.Transaction<Config>,
	params: { signed: readonly SignedSourceType[]; preExisting: ReadonlyMap<string, string> },
): Promise<TargetTypes> {
	const idsByTag = new Map<TypeRecord['tagName'], Set<string>>()
	for (const { source, sourceId, signature } of params.signed) {
		if (!sourceId || signature === undefined || params.preExisting.has(signature)) continue
		idsByTag.set(source.tagName, new Set([...(idsByTag.get(source.tagName) ?? []), sourceId]))
	}
	const answered = new Map<string, Map<string, Scl.Ref<Scl.ElementsOf> | undefined>>()
	for (const [tagName, ids] of idsByTag) {
		// dialecte-allow query-in-loop: one lookup per type tag (four at most), every id of the tag at once
		const matches = await tx.findByAttributes({ tagName, attributes: { id: [...ids] } })
		answered.set(tagName, answersById({ ids, matches }))
	}

	function answer(params: {
		tagName: string
		id: string
		ref: Scl.Ref<Scl.ElementsOf> | undefined
	}): void {
		const byId =
			answered.get(params.tagName) ?? new Map<string, Scl.Ref<Scl.ElementsOf> | undefined>()
		byId.set(params.id, params.ref)
		answered.set(params.tagName, byId)
	}

	return {
		async find({ tagName, id }) {
			const byId = answered.get(tagName)
			if (byId?.has(id)) return byId.get(id)
			const [found] = await tx.findByAttributes({ tagName, attributes: { id } })
			return found && toRef(found.tagName, found.id)
		},
		cloned({ tagName, id, ref }) {
			answer({ tagName, id, ref })
		},
		renamed({ tagName, from, to }) {
			const byId = answered.get(tagName)
			const holder = byId?.get(from)
			if (byId && holder) {
				// the one type the lookup found holding the old id is the one renamed: none holds it now; the new id, found free
				// by the lookup, is held by it now
				byId.set(from, undefined)
				if (byId.has(to) && byId.get(to) === undefined) byId.set(to, holder)
				else byId.delete(to)
				return
			}
			// the old id never asked, or held by several types (a malformed target): both looked up alone again
			byId?.delete(from)
			byId?.delete(to)
		},
	}
}

/** Each id asked answered with its one type, or none; an id several types hold is left out (looked up alone). */
function answersById(params: {
	ids: ReadonlySet<string>
	matches: readonly Scl.TrackedRecord<TypeRecord['tagName']>[]
}): Map<string, Scl.Ref<Scl.ElementsOf> | undefined> {
	const byId = Map.groupBy(params.matches, function idOf(record) {
		return readAttribute({ record, name: 'id' })
	})
	const answers = new Map<string, Scl.Ref<Scl.ElementsOf> | undefined>()
	for (const id of params.ids) {
		const holders = byId.get(id) ?? []
		if (holders.length > 1) continue
		const [holder] = holders
		answers.set(id, holder && toRef(holder.tagName, holder.id))
	}
	return answers
}

/** Build a ref from a dynamic tag name (the per-tag Ref union needs the assertion). */
function toRef(tagName: string, id: string): Scl.Ref<Scl.ElementsOf> {
	return { tagName, id } as unknown as Scl.Ref<Scl.ElementsOf>
}

/**
 * Reclaim the ids of types displaced by a fork. A collision's old target type that
 * ends up with no file-wide referrers is pruned (cascading, refcount-based) and the
 * fork is renamed back to the freed id — so an update whose old version is no longer
 * consumed lands under the original id instead of a hashed fork plus an orphan. A
 * displaced type still referenced elsewhere is left alone and its fork stands.
 */
async function reclaimSupersededTypes(
	tx: Core.Transaction<Config>,
	params: {
		collisions: Collision[]
		/** The types the followers stopped naming: pruned with the displaced ones when nothing names them. */
		leftTypes: LostTypeNames
		idRemap: Map<string, string>
		referrerRecords: Scl.Ref<Scl.ElementsOf>[]
		/** The records of each clone, by the id of its root. */
		cloneRecords: ReadonlyMap<string, readonly Scl.Ref<Scl.ElementsOf>[]>
		stats: ImportTypesStats
	},
): Promise<void> {
	const { collisions, leftTypes, idRemap, referrerRecords, cloneRecords, stats } = params

	const freedOldIds = await pruneDeadSupersededTypes(tx, { collisions, leftTypes })

	// forkedId -> reclaimed original id, for the collisions whose old id was freed.
	const reclaimMap = new Map<string, string>()
	const reclaimedRoots: Scl.Ref<Scl.ElementsOf>[] = []
	for (const collision of collisions) {
		if (!freedOldIds.has(collision.oldId)) continue
		await tx.update(collision.forkRef, { attributes: { id: collision.oldId } })
		reclaimMap.set(collision.forkedId, collision.oldId)
		reclaimedRoots.push(collision.forkRef)
		stats.reclaimed++
		// Reflect the reclaim in the returned source -> target map.
		for (const [sourceId, targetId] of idRemap) {
			if (targetId === collision.forkedId) idRemap.set(sourceId, collision.oldId)
		}
	}

	if (reclaimMap.size === 0) return

	// Repoint everything that pointed at a fork's hashed id (cloned instances and the
	// forked types' own child refs) to the reclaimed original id.
	const records = [...referrerRecords]
	for (const root of reclaimedRoots) records.push(...(cloneRecords.get(root.id ?? '') ?? []))
	await applyTypeIdRemap(tx, { records, idRemap: reclaimMap })
}

/**
 * Prune the displaced old types and the types the followers left that are no longer named anywhere in the file, with
 * the types only they named ({@link collectUnusedTypes}: refcount-based, never chain-based, so a type still shared
 * elsewhere survives). Returns the set of collision ids that were actually freed.
 */
async function pruneDeadSupersededTypes(
	tx: Core.Transaction<Config>,
	params: { collisions: Collision[]; leftTypes: LostTypeNames },
): Promise<Set<string>> {
	const { collisions, leftTypes } = params
	const names = new Map<string, readonly TypeIdTarget[]>(leftTypes)
	for (const collision of collisions) {
		const targets = names.get(collision.oldId) ?? []
		names.set(collision.oldId, [...targets, collision.oldRef.tagName as TypeIdTarget])
	}

	const { trees } = await collectUnusedTypes({ query: tx, names, gone: new Set() })
	const deleted = new Set(trees.map((tree) => tree.root.id))
	for (const { root } of trees) await tx.delete(toRef(root.tagName, root.id))
	return new Set(
		collisions
			.filter(({ oldRef }) => oldRef.id !== undefined && deleted.has(oldRef.id))
			.map((collision) => collision.oldId),
	)
}

/**
 * Point each follower at the id its source's type resolves to. Returns the type names they stopped naming, each with
 * the tag of type that carries it.
 */
async function retargetFollowers(
	tx: Core.Transaction<Config>,
	params: { followers: readonly TypeFollower[]; idRemap: ReadonlyMap<string, string> },
): Promise<LostTypeNames> {
	const { followers, idRemap } = params
	const left = new Map<string, TypeIdTarget[]>()
	// read together: each follower below is then read from the transaction, its earlier updates seen
	await tx.getRecords(
		followers.map(function targetOf(follower) {
			return follower.target as Scl.Ref<Scl.ElementsOf>
		}),
	)
	for (const { source, target } of followers) {
		const record = await tx.getRecord(target)
		if (!record) continue
		const updates: Record<string, string | undefined> = {}
		const pairs = TYPE_ID_REFERENCE_PAIRS[target.tagName] as readonly TypeIdReferencePair[]
		for (const pair of pairs) {
			const sourceValue = readAttribute({ record: source, name: pair.attribute, defaults: 'none' })
			// a source naming no type: the follower names none either (a source naming a type its document lacks is refused
			// by the closure's resolution before this)
			const resolvedId = sourceValue ? idRemap.get(sourceValue) : undefined
			if (sourceValue && !resolvedId) continue
			const current = readAttribute({ record, name: pair.attribute, defaults: 'none' }) || undefined
			if (resolvedId === current) continue
			updates[pair.attribute] = resolvedId
			if (!current) continue
			left.set(current, [...(left.get(current) ?? []), pair.target])
		}
		// `update` removes an attribute given `undefined`; its parameter is typed string-only
		if (Object.keys(updates).length > 0) {
			await tx.update(record, { attributes: updates as Record<string, string> })
		}
	}
	return left
}

/**
 * A fork reused for a source type takes the source id back when no type holds it any more, every referrer following;
 * the returned map says so.
 */
async function reclaimReusedForks(
	tx: Core.Transaction<Config>,
	params: {
		reusedForks: readonly ReusedFork[]
		idRemap: Map<string, string>
		stats: ImportTypesStats
	},
): Promise<void> {
	const { reusedForks, idRemap, stats } = params
	for (const { tagName, sourceId, forkId } of reusedForks) {
		const survivingId = await adoptIncomingName(tx, {
			tagName,
			currentId: forkId,
			desiredId: sourceId,
		})
		if (survivingId === forkId) continue
		stats.reclaimed++
		for (const [mappedSource, targetId] of idRemap) {
			if (targetId === forkId) idRemap.set(mappedSource, survivingId)
		}
	}
}

/** The id a fork of `sourceId` holding the content of `signature` is minted under (before any numbering). */
function forkIdOf(params: { forkPrefix: string; sourceId: string; signature: string }): string {
	const { forkPrefix, sourceId, signature } = params
	return `${forkPrefix}${sourceId}_${shortHash(signature)}`
}

/**
 * Resolve a free id for a forked type. The candidate is
 * `<forkPrefix><sourceId>_<shortHash(signature)>` — the content hash makes it
 * deterministic, so identical divergent content always forks to the same id. In
 * the astronomically unlikely event the hash collides with an unrelated type
 * already under that id, a numeric suffix disambiguates so two distinct types are
 * never minted under one id.
 */
async function freeForkId(
	tx: Core.Transaction<Config>,
	tagName: TypeRecord['tagName'],
	candidate: string,
): Promise<string> {
	let id = candidate
	let suffix = 2
	while ((await tx.findByAttributes({ tagName, attributes: { id } })).length > 0) {
		id = `${candidate}_${suffix}`
		suffix += 1
	}
	return id
}

/** FNV-1a 32-bit, hex. Stable across runs for a given signature. */
function shortHash(input: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, '0')
}
