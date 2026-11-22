import { readImplementations } from './read-implementations'
import { FUNCTION_REF_ATTRIBUTES, FUNCTION_TAGS, LNODE_PATH_TAGS } from './role-lnodes.constants'

import { throwDialecteError } from '@dialecte/core'

import { resolveReferencePaths } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'
import { readAttributes } from '@/v2019C1/helpers'

import type {
	FunctionTag,
	RoleImplementer,
	RoleLNodes,
	RoleLNodesParams,
} from './role-lnodes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The logical nodes of an allocation role: every LNode below the functions its `FunctionRef`s name (by
 * `functionUuid`, else by the `function` path), once each and in document order, nested subfunctions and equipment
 * functions included; the IEDs implementing them, each with its kind (a role names no IED: one role may be implemented
 * by several IEDs, one IED may serve several roles), in document order; the LNodes no logical node implements; the
 * function references naming no function. A fixed number of reads, whatever the size of the role; nothing is kept
 * after the call.
 *
 * Refuses with `ELEMENT_NOT_FOUND` when the document holds no such allocation role.
 *
 * @intent the logical nodes of an allocation role, which IEDs implement them, which are not implemented yet
 *
 * @example
 * const { lnodes, implementers, unimplemented } = await doc.query.specification.roleLNodes({ allocationRole })
 * // implementers → [{ ied, name: 'P1', kind: 'implemented', lnodes: [...] }]
 */
export async function roleLNodes(
	query: Core.Query<Config>,
	params: RoleLNodesParams,
): Promise<RoleLNodes> {
	const { allocationRole } = params
	const role = await query.getRecord(allocationRole)
	if (!role) {
		throwDialecteError('ELEMENT_NOT_FOUND', {
			ref: allocationRole,
			detail: `the document holds no <AllocationRole> "${allocationRole.id}"`,
		})
	}

	const functionRefs = await query.getChildren(role, 'FunctionRef')
	const resolved = await resolveFunctionRefs(query, { functionRefs })
	const functions = uniqueById(
		resolved.flatMap((entry) => (entry.function ? [entry.function] : [])),
	)
	const lnodes = await readLNodesInDocumentOrder(query, { functions })
	const { byLNode, ieds } = await readImplementations(query, { lnodes })

	const lnodeRefs = lnodes.map(toLNodeRef)
	const implementers = ieds.flatMap(function implementerOf(entry): RoleImplementer[] {
		const implemented = lnodeRefs.filter((lnode) => byLNode.get(lnode.id)?.ied.id === entry.ied.id)
		return implemented.length > 0 ? [{ ...entry, lnodes: implemented }] : []
	})
	return {
		lnodes: lnodeRefs,
		implementers,
		unimplemented: lnodeRefs.filter((lnode) => !byLNode.has(lnode.id)),
		unresolvedFunctionRefs: resolved
			.filter((entry) => !entry.function)
			.map((entry) => ({ tagName: 'FunctionRef' as const, id: entry.functionRef.id })),
	}
}

/**
 * The function each reference names: by `functionUuid` (one lookup per function tag for every uuid), else by its
 * `function` path (one batched resolve); `undefined` when it names nothing a reference may name.
 */
async function resolveFunctionRefs(
	query: Core.Query<Config>,
	params: { functionRefs: readonly Scl.TrackedRecord<'FunctionRef'>[] },
): Promise<{ functionRef: Scl.TrackedRecord<'FunctionRef'>; function?: AnyTrackedRecord }[]> {
	const { functionRefs } = params
	const named = functionRefs.map(function namingOf(functionRef) {
		const attributes = readAttributes({ record: functionRef, defaults: 'none' })
		return {
			functionRef,
			uuid: attributes[FUNCTION_REF_ATTRIBUTES.uuid] || undefined,
			path: attributes[FUNCTION_REF_ATTRIBUTES.path] || undefined,
		}
	})
	const uuids = [...new Set(named.flatMap((entry) => (entry.uuid ? [entry.uuid] : [])))]
	const byUuid = await readFunctionsByUuid(query, { uuids })
	const byPath = named.filter((entry) => !entry.uuid && entry.path)
	const resolvedPaths = await resolveReferencePaths(query, {
		records: byPath.map(
			(entry) => entry.functionRef as unknown as Scl.TrackedRecord<Scl.ElementsOf>,
		),
		pathAttribute: FUNCTION_REF_ATTRIBUTES.path,
	})
	const byPathRef = new Map(
		byPath.map((entry, position) => [entry.functionRef.id, resolvedPaths[position]?.record]),
	)
	return named.map(function resolvedOf(entry) {
		const found = entry.uuid ? byUuid.get(entry.uuid) : byPathRef.get(entry.functionRef.id)
		return {
			functionRef: entry.functionRef,
			function: found && isFunction(found) ? found : undefined,
		}
	})
}

/** The functions carrying each uuid, one lookup per function tag; of two carrying a uuid, the first tag's. */
async function readFunctionsByUuid(
	query: Core.Query<Config>,
	params: { uuids: readonly string[] },
): Promise<Map<string, AnyTrackedRecord>> {
	const { uuids } = params
	const byUuid = new Map<string, AnyTrackedRecord>()
	if (uuids.length === 0) return byUuid
	const foundByTag = await Promise.all(
		FUNCTION_TAGS.map(function lookUp(tagName) {
			// dialecte-allow query-in-loop: one lookup per function tag the registry names, every uuid in each
			return query.findByAttributes({ tagName, attributes: { uuid: [...uuids] } })
		}),
	)
	for (const record of foundByTag.flat() as AnyTrackedRecord[]) {
		const { uuid } = readAttributes({ record, defaults: 'none' })
		if (uuid && !byUuid.has(uuid)) byUuid.set(uuid, record)
	}
	return byUuid
}

/**
 * Every LNode below the functions given, once each, in document order: the functions put in document order from their
 * ancestors (one read), what lies between them and their LNodes read in one walk, then followed in memory in the order
 * the parents store their children.
 */
async function readLNodesInDocumentOrder(
	query: Core.Query<Config>,
	params: { functions: readonly AnyTrackedRecord[] },
): Promise<Scl.TrackedRecord<'LNode'>[]> {
	const { functions } = params
	if (functions.length === 0) return []
	const ordered = await sortInDocumentOrder(query, { records: functions })
	const below = await query.findDescendantsOfEach(ordered as Scl.TrackedRecord<FunctionTag>[], {
		collect: [...LNODE_PATH_TAGS] as never,
	})
	const byId = new Map<string, AnyTrackedRecord>(ordered.map((record) => [record.id, record]))
	for (const groups of below) {
		for (const records of Object.values(groups) as AnyTrackedRecord[][]) {
			for (const record of records) byId.set(record.id, record)
		}
	}
	return lnodesBelow({ roots: ordered, byId })
}

/** The LNodes below the roots, depth first in stored child order, each once (a root below another adds nothing). */
function lnodesBelow(params: {
	roots: readonly AnyTrackedRecord[]
	byId: ReadonlyMap<string, AnyTrackedRecord>
}): Scl.TrackedRecord<'LNode'>[] {
	const { roots, byId } = params
	const seen = new Set<string>()
	const lnodes: Scl.TrackedRecord<'LNode'>[] = []
	const pending = [...roots].reverse()
	while (pending.length > 0) {
		const record = pending.pop() as AnyTrackedRecord
		const children = record.children.flatMap((childRef) => byId.get(childRef.id) ?? [])
		for (const child of [...children].reverse()) {
			if (seen.has(child.id)) continue
			seen.add(child.id)
			pending.push(child)
		}
		if (record.tagName === 'LNode') lnodes.push(record as Scl.TrackedRecord<'LNode'>)
	}
	return lnodes
}

/**
 * The records in document order: each placed by its index among its parent's children at every level, the ancestors
 * of all read at once.
 */
async function sortInDocumentOrder(
	query: Core.Query<Config>,
	params: { records: readonly AnyTrackedRecord[] },
): Promise<AnyTrackedRecord[]> {
	const { records } = params
	const ancestorsOfEach = await query.findAncestorsOfEach(
		records as Scl.TrackedRecord<Scl.ElementsOf>[],
		{ order: 'top-down' },
	)
	const positioned = records.map(function positionOf(record, index) {
		const chain = [...(ancestorsOfEach[index] as AnyTrackedRecord[]), record]
		const position = chain
			.slice(1)
			.map((step, level) => chain[level].children.findIndex((child) => child.id === step.id))
		return { record, position }
	})
	return positioned
		.sort((first, second) => comparePositions({ first: first.position, second: second.position }))
		.map((entry) => entry.record)
}

function comparePositions(params: { first: readonly number[]; second: readonly number[] }): number {
	const { first, second } = params
	for (let level = 0; level < Math.min(first.length, second.length); level++) {
		if (first[level] !== second[level]) return first[level] - second[level]
	}
	return first.length - second.length
}

function isFunction(record: AnyTrackedRecord): boolean {
	return (FUNCTION_TAGS as readonly string[]).includes(record.tagName)
}

function uniqueById(records: readonly AnyTrackedRecord[]): AnyTrackedRecord[] {
	return [...new Map(records.map((record) => [record.id, record])).values()]
}

function toLNodeRef(lnode: Scl.TrackedRecord<'LNode'>): Scl.Ref<'LNode'> {
	return { tagName: 'LNode', id: lnode.id }
}
