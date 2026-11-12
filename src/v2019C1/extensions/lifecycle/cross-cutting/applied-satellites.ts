import {
	CROSS_CUTTING_SATELLITE_CONTAINERS,
	CROSS_CUTTING_SATELLITE_TAGS,
	FRAME_CARRIED_TAGS,
	SATELLITE_HELD_REFERENCES,
} from './applied-satellites.constants'

import { toRef } from '@dialecte/core/helpers'

import { sortInDocumentOrder } from '@/v2019C1/extensions/lifecycle/source-root/document-order'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	AppliedSatellite,
	IndexedSatellite,
	ResolveAppliedSatellitesParams,
	SatelliteIndex,
} from './applied-satellites.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type * as Core from '@dialecte/core'
import type { AnyRef, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Resolve the cross-cutting satellites that apply to ANY element within the
 * primary's subtree, and within the subtrees of what it composes (`composedRefs`: the functions an application composes
 * travel with it): for every uuid-bearing element there, find the containers (e.g. `Variable`) referencing it.
 * Excludes containers that live INSIDE those subtrees (internal — already carried by their clone/diff), but, for a
 * topology frame, those its levels hold (`frame`). This is layer-agnostic: any verb passes its primary and gets the
 * applied satellites.
 */
export async function resolveAppliedSatellites(
	query: Core.Query<Config>,
	params: ResolveAppliedSatellitesParams,
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const applied = await resolveAppliedSatelliteTargets(query, params)
	return applied.map(function satelliteOf(satellite) {
		return satellite.satelliteRef
	})
}

/**
 * The satellites {@link resolveAppliedSatellites} resolves, each with its uuid and what it applies to among the targets
 * read (record ids): what a caller tells instances apart by. The satellites of the document are read once (`index`),
 * their references matched to the uuids of the targets — in the order the targets are read, a variable before a
 * behaviour description.
 */
export async function resolveAppliedSatelliteTargets(
	query: Core.Query<Config>,
	params: ResolveAppliedSatellitesParams,
): Promise<AppliedSatellite[]> {
	const { primaryRef, composedRefs = [], leftOut } = params
	const tree = await query.any.getTree(primaryRef)
	if (!tree) return []

	const subtreeIds = new Set<string>()
	const targets: AnyTreeRecord[] = []
	collectTargets({ node: tree, subtreeIds, targets })
	for (const composedRef of composedRefs) {
		if (subtreeIds.has(composedRef.id ?? '')) continue
		const composedTree = await query.any.getTree(composedRef)
		if (!composedTree) continue
		// a function left out travels not: nothing applies to it, and what it holds is no satellite either
		const collected = leftOut?.has(composedTree.id) ? [] : targets
		collectTargets({ node: composedTree, subtreeIds, targets: collected })
	}

	// what a level of a frame holds is left out of its clone
	const levelHeld = new Set<string>()
	if (params.frame) collectLevelHeld({ node: tree, levelHeld })

	// each target by its uuid, with where it is read
	const targetsByUuid = new Map<string, { target: AnyTreeRecord; position: number }>()
	targets.forEach(function indexTarget(target, position) {
		if (leftOut?.has(target.id)) return
		// a uuid names one element
		targetsByUuid.set(readAttribute({ record: target, name: 'uuid', defaults: 'none' }), {
			target,
			position,
		})
	})

	const index = params.index ?? (await readSatelliteIndex(query))
	const found: { satellite: AppliedSatellite; first: number }[] = []
	for (const indexed of index.values()) {
		const satelliteId = indexed.satelliteRef.id ?? ''
		// internal/external guard: a satellite inside the subtree is already carried
		if (subtreeIds.has(satelliteId) && !levelHeld.has(satelliteId)) continue
		const hits = findTargets({ indexed, targetsByUuid, leftOut })
		// one a level of the frame holds belongs to the frame: it travels with it applying to a level it lands on only
		const framed =
			levelHeld.has(satelliteId) && appliesWithin({ indexed, scope: params.scope, leftOut })
		if (hits.length === 0 && !framed) {
			continue
		}
		found.push({
			satellite: {
				satelliteRef: indexed.satelliteRef,
				uuid: indexed.uuid,
				targetIds: hits.map(function idOf(hit) {
					return hit.target.id
				}),
			},
			first: Math.min(
				Number.POSITIVE_INFINITY,
				...hits.map(function positionOf(hit) {
					return hit.position
				}),
			),
		})
	}
	return orderFound(query, { found })
}

/**
 * The satellites found, in the order of the first target each applies to; in the document's order beside one another:
 * a store lists the satellites by record id.
 */
async function orderFound(
	query: Core.Query<Config>,
	params: { found: readonly { satellite: AppliedSatellite; first: number }[] },
): Promise<AppliedSatellite[]> {
	const rank = await rankInDocumentOrder(query, {
		refs: params.found.map(function refOf(entry) {
			return entry.satellite.satelliteRef
		}),
	})
	return [...params.found]
		.sort(function inTargetOrder(one, other) {
			return (
				one.first - other.first ||
				rankOf({ rank, satellite: one.satellite }) - rankOf({ rank, satellite: other.satellite })
			)
		})
		.map(function satelliteOf(entry) {
			return entry.satellite
		})
}

/** Where a satellite stands in document order, among those ranked. */
function rankOf(params: {
	rank: ReadonlyMap<string, number>
	satellite: AppliedSatellite
}): number {
	return params.rank.get(params.satellite.satelliteRef.id ?? '') ?? 0
}

/** The position of each record in document order (record id -> rank): the records read at once. */
export async function rankInDocumentOrder(
	query: Core.Query<Config>,
	params: { refs: readonly Scl.Ref<Scl.ElementsOf>[] },
): Promise<Map<string, number>> {
	if (params.refs.length < 2) return new Map()
	const read = await query.any.getRecords([...params.refs] as AnyRef[])
	const records = read.filter(function isRead(record): record is AnyTrackedRecord {
		return record !== undefined
	})
	const ordered = await sortInDocumentOrder(query, { records })
	return new Map(
		ordered.map(function rankedAt(record, position) {
			return [record.id, position] as const
		}),
	)
}

/**
 * The cross-cutting satellites of a document (`Variable`, `BehaviorDescription`), each with the references it holds and
 * the uuids they name: one read per satellite tag and per reference tag.
 */
export async function readSatelliteIndex(query: Core.Query<Config>): Promise<SatelliteIndex> {
	const index = new Map<string, IndexedSatellite>()
	// the uuids of the satellites of each template reference, in the document's order: grouped once
	const byTemplate = new Map<string, string[]>()
	for (const tagName of CROSS_CUTTING_SATELLITE_CONTAINERS) {
		for (const record of await query.getRecordsByTagName(tagName)) {
			const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
			const templateUuid = readAttribute({ record, name: 'templateUuid', defaults: 'none' })
			if (templateUuid)
				byTemplate.set(templateUuid, [...(byTemplate.get(templateUuid) ?? []), uuid])
			index.set(record.id, {
				satelliteRef: toRef(record) as Scl.Ref<Scl.ElementsOf>,
				uuid,
				templateUuid,
				// its own uuid first, then its siblings', once all are read
				lineages: [uuid],
				references: [],
			})
		}
	}
	for (const indexed of index.values()) {
		const siblings = byTemplate.get(indexed.templateUuid)
		if (siblings) indexed.lineages = [indexed.uuid, ...siblings]
	}
	for (const { tagName, pairs } of SATELLITE_HELD_REFERENCES) {
		for (const record of await query.getRecordsByTagName(tagName as Scl.ElementsOf)) {
			// the schema puts such a reference in a satellite only: its parent is one read above
			const owner = record.parent ? index.get(record.parent.id) : undefined
			if (!owner) continue
			const names = pairs.flatMap(function nameOf(pair) {
				const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
				if (!uuid) return []
				const path = readAttribute({ record, name: pair.attribute.path, defaults: 'none' })
				const written = path
					? { attribute: pair.attribute.path, path }
					: { attribute: pair.attribute.uuid }
				return [{ uuid, targets: pair.target, ...written }]
			})
			owner.references.push({ id: record.id, tagName, names })
		}
	}
	return index
}

/**
 * The satellites the project already holds by their uuid (source record ids): a first placement neither lists nor places
 * them again — writing one would give the project two elements of one uuid. One read per satellite tag.
 */
export async function findHeldSatelliteIds(
	projectQuery: Core.Query<Config>,
	params: { satellites: readonly Pick<AppliedSatellite, 'satelliteRef' | 'uuid'>[] },
): Promise<Set<string>> {
	const uuidsByTag = new Map<string, string[]>()
	for (const { satelliteRef, uuid } of params.satellites) {
		const uuids = uuidsByTag.get(satelliteRef.tagName)
		if (uuids) uuids.push(uuid)
		else uuidsByTag.set(satelliteRef.tagName, [uuid])
	}
	const heldUuids = new Set<string>()
	for (const [tagName, uuids] of uuidsByTag) {
		const records = await projectQuery.any.findByAttributes({
			tagName: tagName as Scl.ElementsOf,
			attributes: { uuid: uuids },
		})
		for (const record of records)
			heldUuids.add(readAttribute({ record, name: 'uuid', defaults: 'none' }))
	}
	const held = new Set<string>()
	for (const { satelliteRef, uuid } of params.satellites) {
		if (heldUuids.has(uuid)) held.add(satelliteRef.id ?? '')
	}
	return held
}

/** Whether a satellite applies, through a reference not left out, to anything the scope holds. */
function appliesWithin(params: {
	indexed: IndexedSatellite
	scope: ContributionScope | undefined
	leftOut: ReadonlySet<string> | undefined
}): boolean {
	const { indexed, scope, leftOut } = params
	if (!scope) return false
	return indexed.references.some(function namesWithin(reference) {
		return (
			!leftOut?.has(reference.id) &&
			reference.names.some(function isWithin(named) {
				return scope.has(named.uuid)
			})
		)
	})
}

/** The targets a satellite's references name, each once; but the references left out. */
function findTargets(params: {
	indexed: IndexedSatellite
	targetsByUuid: ReadonlyMap<string, { target: AnyTreeRecord; position: number }>
	leftOut: ReadonlySet<string> | undefined
}): { target: AnyTreeRecord; position: number }[] {
	const { indexed, targetsByUuid, leftOut } = params
	const hits = new Map<string, { target: AnyTreeRecord; position: number }>()
	for (const reference of indexed.references) {
		if (leftOut?.has(reference.id)) continue
		for (const named of reference.names) {
			const hit = targetsByUuid.get(named.uuid)
			if (hit && named.targets.includes(hit.target.tagName)) hits.set(hit.target.id, hit)
		}
	}
	return [...hits.values()]
}

function collectTargets(params: {
	node: AnyTreeRecord
	subtreeIds: Set<string>
	targets: AnyTreeRecord[]
}): void {
	const { node, subtreeIds, targets } = params
	subtreeIds.add(node.id)
	// only uuid-bearing elements can be referenced by a uuid satellite
	if (
		readAttribute({ record: node, name: 'uuid', defaults: 'none', fullObject: true }) !== undefined
	)
		targets.push(node)
	for (const child of node.tree) collectTargets({ node: child, subtreeIds, targets })
}

/** The satellites the levels of a frame hold: below it, but in what it places with all it holds (a function). */
function collectLevelHeld(params: { node: AnyTreeRecord; levelHeld: Set<string> }): void {
	const { node, levelHeld } = params
	for (const child of node.tree) {
		if (CROSS_CUTTING_SATELLITE_TAGS.has(child.tagName)) levelHeld.add(child.id)
		else if (!FRAME_CARRIED_TAGS.has(child.tagName)) collectLevelHeld({ node: child, levelHeld })
	}
}
