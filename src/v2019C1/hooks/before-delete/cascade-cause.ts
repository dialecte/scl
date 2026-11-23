import type { CascadeOutside } from './cascade-cause.types'
import type { DeleteCascade } from './orphaned-refs.types'
import type { Scl } from '@/v2019C1/config'

/**
 * What a cascade removes **outside** the subtrees of its roots, each with the root it goes with (`causeById`, walked up
 * to the root above the record it named): the references it deletes and the containers they leave holding nothing,
 * then the references it clears. A record whose parent the cascade removes too is left out: the topmost element stands
 * for everything it holds. Reads the records the cascade already holds, nothing else.
 */
export function outsideCascadeRemovals(params: {
	roots: readonly Scl.RawRecord<Scl.ElementsOf>[]
	cascade: DeleteCascade
	/**
	 * The records to walk a cause's ancestry over; default: the cascade's own. A caller that reports a cascade with
	 * records taken out (what earlier steps deleted already) passes the whole one, or an ancestry through a record it
	 * took out resolves to no root.
	 */
	read?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): CascadeOutside[] {
	const { roots, cascade } = params
	const rootIds = new Set(roots.map((root) => root.id))
	const read = params.read ?? recordsOfCascade({ roots, cascade })
	const removedIds = new Set([...cascade.deleted, ...cascade.within].map((record) => record.id))
	const outside: CascadeOutside[] = []
	for (const record of cascade.deleted) {
		if (rootIds.has(record.id)) continue
		if (nearestCascadeRoot({ record, rootIds, read })) continue
		if (record.parent && removedIds.has(record.parent.id)) continue
		outside.push({
			record,
			effect: 'deleted',
			rootId: rootOf({ id: record.id, cascade, rootIds, read }),
			holds: [],
		})
	}
	for (const orphaned of cascade.cleared) {
		const { record } = orphaned
		outside.push({
			record,
			effect: 'cleared',
			rootId: rootOf({ id: record.id, cascade, rootIds, read }),
			holds: [],
		})
	}
	// what a removed element takes with it is named under it, never on its own
	const heldBy = heldByEach({
		topIds: new Set(
			outside.flatMap((entry) => (entry.effect === 'deleted' ? [entry.record.id] : [])),
		),
		records: [...cascade.deleted, ...cascade.within],
		rootIds,
		read,
	})
	return outside.map((entry) => ({ ...entry, holds: heldBy.get(entry.record.id) ?? [] }))
}

/**
 * The records of a cascade that each of `topIds` takes with it: a record below one of them, walked up over the records
 * read. A record inside the subtree of a root is left to that root ({@link heldByCascadeRoot}).
 */
function heldByEach(params: {
	topIds: ReadonlySet<string>
	records: readonly Scl.RawRecord<Scl.ElementsOf>[]
	rootIds: ReadonlySet<string>
	read: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): Map<string, Scl.RawRecord<Scl.ElementsOf>[]> {
	const { topIds, records, rootIds, read } = params
	const held = new Map<string, Scl.RawRecord<Scl.ElementsOf>[]>()
	for (const record of records) {
		if (topIds.has(record.id) || rootIds.has(record.id)) continue
		if (nearestCascadeRoot({ record, rootIds, read })) continue
		const topId = nearestCascadeRoot({ record, rootIds: topIds, read })
		if (!topId) continue
		const inside = held.get(topId)
		if (inside) inside.push(record)
		else held.set(topId, [record])
	}
	return held
}

/**
 * What each root of a cascade still holds: every record of the cascade inside its subtree, under the nearest root
 * above it. A root's own record is left out.
 */
export function heldByCascadeRoot(params: {
	roots: readonly Scl.RawRecord<Scl.ElementsOf>[]
	cascade: DeleteCascade
	/** The records to walk ancestry over; default: the cascade's own ({@link outsideCascadeRemovals}). */
	read?: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): Map<string, Scl.RawRecord<Scl.ElementsOf>[]> {
	const { roots, cascade } = params
	const rootIds = new Set(roots.map((root) => root.id))
	const read = params.read ?? recordsOfCascade({ roots, cascade })
	const held = new Map<string, Scl.RawRecord<Scl.ElementsOf>[]>()
	for (const record of [...cascade.deleted, ...cascade.within]) {
		if (rootIds.has(record.id)) continue
		const rootId = nearestCascadeRoot({ record, rootIds, read })
		if (!rootId) continue
		const inside = held.get(rootId)
		if (inside) inside.push(record)
		else held.set(rootId, [record])
	}
	return held
}

/** The records a cascade read, by id: its roots, what it deletes and what those take with them. */
export function recordsOfCascade(params: {
	roots: readonly Scl.RawRecord<Scl.ElementsOf>[]
	cascade: DeleteCascade
}): Map<string, Scl.RawRecord<Scl.ElementsOf>> {
	const { roots, cascade } = params
	return new Map(
		[...roots, ...cascade.deleted, ...cascade.within].map((record) => [record.id, record]),
	)
}

/** The id of the nearest root above a record, its parents walked over the records read; `undefined` when none. */
export function nearestCascadeRoot(params: {
	record: Scl.RawRecord<Scl.ElementsOf>
	rootIds: ReadonlySet<string>
	read: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): string | undefined {
	const { rootIds, read } = params
	let parentRef = params.record.parent
	while (parentRef) {
		if (rootIds.has(parentRef.id)) return parentRef.id
		parentRef = read.get(parentRef.id)?.parent ?? null
	}
	return undefined
}

/** The root a record outside every subtree goes with: the record it named, then the root that record belongs to. */
function rootOf(params: {
	id: string
	cascade: DeleteCascade
	rootIds: ReadonlySet<string>
	read: ReadonlyMap<string, Scl.RawRecord<Scl.ElementsOf>>
}): string | undefined {
	const { id, cascade, rootIds, read } = params
	const causeId = cascade.causeById.get(id)
	if (!causeId) return undefined
	if (rootIds.has(causeId)) return causeId
	const cause = read.get(causeId)
	return cause ? nearestCascadeRoot({ record: cause, rootIds, read }) : undefined
}
