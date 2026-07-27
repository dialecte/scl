import { resolve, isLNodeLocked } from '../query'

import { TYPE_ID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference'
import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'
import { applyTypeIdRemap } from '@/v2019C1/extensions/reference/transaction'
import { elementSignature } from '@/v2019C1/extensions/signature/query'

import type { ResolvedDataModel } from '../query/resolve.types'
import type {
	ImportTypesParams,
	ImportTypesResult,
	ImportTypesStats,
	TypeRecord,
} from './import-types.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { TypeIdReferencePair, TypeIdRefTagName } from '@/v2019C1/extensions/reference'
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
} from './import-types.types'

/**
 * Import the type closure of `records` into the target `DataTypeTemplates`,
 * content-addressed. For each type, bottom-up:
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
 */
export async function importTypes(
	tx: Core.Transaction<Config>,
	params: ImportTypesParams,
): Promise<ImportTypesResult> {
	const {
		sourceQuery,
		records,
		cloneMappings = [],
		forkPrefix = '',
		keepNameTypesFrom = 'target',
	} = params

	const resolved = await resolve(sourceQuery, { records })
	const sourceTypes = collectTypesBottomUp(resolved)

	const dataTypeTemplates = await tx.ensureChild(await tx.getRoot(), {
		tagName: 'DataTypeTemplates',
		attributes: {},
	})

	// Dedup only against the types that already existed in the target (never
	// against types we mint during this run).
	const preExisting = await buildPreExistingSignatureIndex(tx)

	const idRemap = new Map<string, string>()
	const clonedRoots: Scl.Ref<Scl.ElementsOf>[] = []
	const collisions: Collision[] = []
	const stats: ImportTypesStats = { reused: 0, preserved: 0, forked: 0, reclaimed: 0 }

	for (const source of sourceTypes) {
		const sourceId = await sourceQuery.getAttribute(source, { name: 'id' })
		if (!sourceId) continue

		const signature = await elementSignature(sourceQuery, {
			ref: { tagName: source.tagName, id: source.id },
			resolveReferences: true,
		})

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
			idRemap.set(sourceId, survivingId)
			// Keep the dedup index consistent so a later incoming type sharing this
			// signature reuses the renamed (surviving) id, not the vanished old one.
			if (survivingId !== reusedId) preExisting.set(signature, survivingId)
			stats.reused++
			continue
		}

		const tree = await sourceQuery.getTree(source)
		if (!tree) continue

		const [existing] = await tx.findByAttributes({
			tagName: source.tagName,
			attributes: { id: sourceId },
		})

		let targetId = sourceId
		let preparedTree = tree
		if (existing) {
			targetId = await freeForkId(
				tx,
				source.tagName,
				`${forkPrefix}${sourceId}_${shortHash(signature)}`,
			)
			preparedTree = withRootId(tree, targetId)
			stats.forked++
		} else {
			stats.preserved++
		}

		const clone = await tx.deepClone(dataTypeTemplates, preparedTree)
		idRemap.set(sourceId, targetId)
		if (clone?.record) {
			clonedRoots.push(toRef(clone.record.tagName, clone.record.id))
			if (existing) {
				collisions.push({
					oldId: sourceId,
					oldRef: toRef(existing.tagName, existing.id),
					forkRef: toRef(clone.record.tagName, clone.record.id),
					forkedId: targetId,
				})
			}
		}
	}

	// Second pass: now that idRemap is complete, repoint the child type-refs of
	// every cloned type and the `lnType` of the cloned instances (clone mappings).
	// A locked LNode (implemented in an IED) owns its `lnType` — exclude it from the
	// instance remap so a fork/dedup never rewrites it.
	const recordsToRemap: Scl.Ref<Scl.ElementsOf>[] = []
	for (const mapping of cloneMappings) {
		if (mapping.target.tagName === 'LNode' && (await isLNodeLocked(tx, mapping.target))) continue
		recordsToRemap.push(mapping.target)
	}
	for (const root of clonedRoots) {
		const tree = await tx.getTree(root)
		if (tree) collectRefs(tree, recordsToRemap)
	}
	await applyTypeIdRemap(tx, { records: recordsToRemap, idRemap })

	// Third pass: reclaim the ids of types a fork superseded, when the displaced old
	// type is left with no file-wide referrers.
	if (collisions.length > 0) {
		await reclaimSupersededTypes(tx, {
			collisions,
			idRemap,
			referrerRecords: recordsToRemap,
			stats,
		})
	}

	return { idRemap, stats }
}

// ── Internals ───────────────────────────────────────────────────────────────────

/** Bottom-up so a type's children are reconciled before the parent references them. */
function collectTypesBottomUp(resolved: ResolvedDataModel): TypeRecord[] {
	return [...resolved.enumTypes, ...resolved.daTypes, ...resolved.doTypes, ...resolved.lnodeTypes]
}

const TYPE_TAGS = ['EnumType', 'DAType', 'DOType', 'LNodeType'] as const

/** signature -> id of the types already present in the target, first occurrence wins. */
async function buildPreExistingSignatureIndex(
	tx: Core.Transaction<Config>,
): Promise<Map<string, string>> {
	const index = new Map<string, string>()
	for (const tagName of TYPE_TAGS) {
		const existing = await tx.getRecordsByTagName(tagName)
		for (const record of existing) {
			const id = record.attributes.find((a) => a.name === 'id')?.value
			if (!id) continue
			const signature = await elementSignature(tx, {
				ref: { tagName, id: record.id },
				resolveReferences: true,
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

/** Build a ref from a dynamic tag name (the per-tag Ref union needs the assertion). */
function toRef(tagName: string, id: string): Scl.Ref<Scl.ElementsOf> {
	return { tagName, id } as unknown as Scl.Ref<Scl.ElementsOf>
}

function collectRefs(node: Scl.TreeRecord<Scl.ElementsOf>, out: Scl.Ref<Scl.ElementsOf>[]): void {
	out.push(toRef(node.tagName, node.id))
	for (const child of node.tree ?? []) collectRefs(child, out)
}

const refKey = (ref: Scl.Ref<Scl.ElementsOf>): string => `${ref.tagName}#${ref.id}`

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
		idRemap: Map<string, string>
		referrerRecords: Scl.Ref<Scl.ElementsOf>[]
		stats: ImportTypesStats
	},
): Promise<void> {
	const { collisions, idRemap, referrerRecords, stats } = params

	const freedOldIds = await pruneDeadSupersededTypes(tx, collisions)

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
	for (const root of reclaimedRoots) {
		const tree = await tx.getTree(root)
		if (tree) collectRefs(tree, records)
	}
	await applyTypeIdRemap(tx, { records, idRemap: reclaimMap })
}

/**
 * Prune the displaced old types that are no longer referenced anywhere in the file,
 * cascading to descendant types that lose their last referrer once a parent is
 * deleted. Refcount-based (never chain-based): a descendant still shared elsewhere
 * survives. Returns the set of collision ids that were actually freed.
 */
async function pruneDeadSupersededTypes(
	tx: Core.Transaction<Config>,
	collisions: Collision[],
): Promise<Set<string>> {
	const freedOldIds = new Set<string>()
	// Map a candidate ref back to the collision id it may free (only the displaced
	// old roots carry one; cascade-discovered descendants free nothing to reclaim).
	const collidedIdByRef = new Map<string, string>(
		collisions.map((c) => [refKey(c.oldRef), c.oldId]),
	)

	const worklist: Scl.Ref<Scl.ElementsOf>[] = collisions.map((c) => c.oldRef)
	const queued = new Set<string>(worklist.map(refKey))
	const deleted = new Set<string>()

	let progressed = true
	while (progressed) {
		progressed = false
		for (const ref of worklist) {
			const key = refKey(ref)
			if (deleted.has(key)) continue
			const referrers = await findRefsPointingTo(tx, { target: ref })
			if (referrers.length > 0) continue // still consumed — keep it (and its fork)

			// Gather the child types it references before deleting (delete cascades and
			// removes its own DO/DA children, dropping their referrers to child types).
			const tree = await tx.getTree(ref)
			const childTypeRefs = tree ? await referencedTypeRefs(tx, tree) : []

			await tx.delete(ref)
			deleted.add(key)
			progressed = true
			const collidedId = collidedIdByRef.get(key)
			if (collidedId !== undefined) freedOldIds.add(collidedId)

			// Re-evaluate the child types it referenced now that this parent is gone; a
			// child that is itself a displaced old root is already in `collidedIdByRef`.
			for (const childRef of childTypeRefs) {
				const childKey = refKey(childRef)
				if (!queued.has(childKey)) {
					worklist.push(childRef)
					queued.add(childKey)
				}
			}
		}
	}

	return freedOldIds
}

/** Resolve every type-id reference (`lnType`, `DO/SDO.type`, `DA/BDA.type`) in a type's subtree to the target record it points at. */
async function referencedTypeRefs(
	tx: Core.Transaction<Config>,
	tree: Scl.TreeRecord<Scl.ElementsOf>,
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const out: Scl.Ref<Scl.ElementsOf>[] = []
	const seen = new Set<string>()

	async function walk(node: Scl.TreeRecord<Scl.ElementsOf>): Promise<void> {
		const pairs = TYPE_ID_REFERENCE_PAIRS[node.tagName as TypeIdRefTagName] as
			| readonly TypeIdReferencePair[]
			| undefined
		for (const pair of pairs ?? []) {
			if (!matchesWhen(node, pair)) continue
			const value = node.attributes.find((a) => a.name === pair.attribute)?.value
			if (!value) continue
			const [record] = await tx.findByAttributes({
				tagName: pair.target as Scl.ElementsOf,
				attributes: { id: value },
			})
			if (!record) continue
			const ref = toRef(pair.target, record.id)
			const key = refKey(ref)
			if (!seen.has(key)) {
				seen.add(key)
				out.push(ref)
			}
		}
		for (const child of node.tree ?? []) await walk(child)
	}

	await walk(tree)
	return out
}

function matchesWhen(node: Scl.TreeRecord<Scl.ElementsOf>, pair: TypeIdReferencePair): boolean {
	if (!pair.when) return true
	return node.attributes.find((a) => a.name === pair.when!.attribute)?.value === pair.when.equals
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
