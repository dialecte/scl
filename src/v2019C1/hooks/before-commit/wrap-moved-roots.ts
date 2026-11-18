import { chainOf } from './moved-roots'
import { PRIVATE_TAG, PRIVATE_TYPE_ATTRIBUTE } from './wrap-moved-roots.constants'

import { toRawRecord } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { readAttribute } from '@/v2019C1/helpers'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { MovePlaces, MovedRef } from './moved-roots.types'
import type { WrapGroup } from './wrap-moved-roots.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The moved roots of the extension namespace left under a parent of the default one, placed in a `Private` of their
 * namespace as on create: those under one parent with one namespace together, in the `Private` of that type the parent
 * holds, else in a new one; none when a wrapper of that namespace above the parent already holds the context. The
 * parents' wrappers are read once, the records taken from what the commit's earlier steps wrote first.
 */
export async function wrapMovedRoots(
	query: Core.Query<Config>,
	params: {
		places: MovePlaces
		roots: readonly MovedRef[]
		pending: ReadonlyMap<string, AnyRawRecord>
	},
): Promise<Scl.Operation[]> {
	const { pending } = params
	const groups = wrapGroupsOf(params)
	if (groups.length === 0) return []
	const privateRefs = [
		...new Map(
			groups.flatMap((group) =>
				group.parent.children
					.filter((child) => isTransparentElement(child.tagName))
					.map((child) => [child.id, child] as const),
			),
		).values(),
	]
	const read = privateRefs.length > 0 ? await query.any.getRecords(privateRefs) : []
	const privates = new Map(
		read.flatMap((record): [string, AnyRawRecord][] =>
			record ? [[record.id, pending.get(record.id) ?? (toRawRecord(record) as AnyRawRecord)]] : [],
		),
	)
	return groups.reduce<{ operations: Scl.Operation[]; parents: Map<string, AnyRawRecord> }>(
		function wrapGroup(state, group) {
			const parent = state.parents.get(group.parent.id) ?? group.parent
			const { operations, parentAfter } = wrapOneGroup({ group, parent, privates })
			return {
				operations: [
					...state.operations.filter((operation) => !writes({ operation, id: parent.id })),
					...operations,
				],
				parents: new Map([...state.parents, [parent.id, parentAfter]]),
			}
		},
		{ operations: [], parents: new Map() },
	).operations
}

/** The roots to wrap, by parent and namespace prefix. */
function wrapGroupsOf(params: {
	places: MovePlaces
	roots: readonly MovedRef[]
	pending: ReadonlyMap<string, AnyRawRecord>
}): WrapGroup[] {
	const { places, roots, pending } = params
	const groups = new Map<string, WrapGroup>()
	for (const root of roots) {
		const child = pending.get(root.id) ?? places.read.get(root.id)
		const parentId = child?.parent?.id
		const parent = parentId
			? (pending.get(parentId) ?? places.read.get(parentId) ?? places.written.get(parentId))
			: undefined
		if (!child || !parent || isTransparentElement(parent.tagName)) continue
		if (child.namespace.uri === parent.namespace.uri) continue
		// an element of that namespace above the parent sits in a wrapper of it already
		const wrapped = chainOf({ places, id: parent.id }).some(
			(above) => above.namespace.uri === child.namespace.uri,
		)
		if (wrapped) continue
		const key = `${parent.id}\n${child.namespace.prefix}`
		const group = groups.get(key) ?? { parent, prefix: child.namespace.prefix, children: [] }
		groups.set(key, { ...group, children: [...group.children, child] })
	}
	return [...groups.values()]
}

/**
 * The operations placing one group in its parent's `Private` of its namespace, a new one when the parent holds none:
 * each child under it, the wrapper holding them, the parent without them (and with the new wrapper).
 */
function wrapOneGroup(params: {
	group: WrapGroup
	parent: AnyRawRecord
	privates: ReadonlyMap<string, AnyRawRecord>
}): { operations: Scl.Operation[]; parentAfter: AnyRawRecord } {
	const { group, parent, privates } = params
	const refs = group.children.map((child) => ({ id: child.id, tagName: child.tagName }))
	const existing = parent.children
		.map((child) => privates.get(child.id))
		.find(
			(record) =>
				record !== undefined &&
				readAttribute({ record, name: PRIVATE_TYPE_ATTRIBUTE, defaults: 'none' }) === group.prefix,
		)
	const wrapper: AnyRawRecord = existing
		? { ...existing, children: [...existing.children, ...refs] }
		: {
				id: crypto.randomUUID(),
				tagName: PRIVATE_TAG,
				namespace: SCL_DIALECTE_CONFIG.namespaces.default,
				attributes: [{ name: PRIVATE_TYPE_ATTRIBUTE, value: group.prefix }],
				value: '',
				parent: { id: parent.id, tagName: parent.tagName },
				children: refs,
			}
	const moved = new Set(refs.map((ref) => ref.id))
	const parentAfter: AnyRawRecord = {
		...parent,
		children: [
			...parent.children.filter((child) => !moved.has(child.id)),
			...(existing ? [] : [{ id: wrapper.id, tagName: PRIVATE_TAG }]),
		],
	}
	const operations: Scl.Operation[] = [
		existing ? updated({ oldRecord: existing, newRecord: wrapper }) : created({ record: wrapper }),
		...group.children.map((child) =>
			updated({
				oldRecord: child,
				newRecord: { ...child, parent: { id: wrapper.id, tagName: PRIVATE_TAG } },
			}),
		),
		// one parent write for all its groups: the last one, from the parent as first read
		updated({ oldRecord: group.parent, newRecord: parentAfter }),
	]
	return { operations, parentAfter }
}

function updated(params: { oldRecord: AnyRawRecord; newRecord: AnyRawRecord }): Scl.Operation {
	return {
		status: 'updated',
		oldRecord: params.oldRecord as Scl.RawRecord<Scl.ElementsOf>,
		newRecord: params.newRecord as Scl.RawRecord<Scl.ElementsOf>,
	}
}

function created(params: { record: AnyRawRecord }): Scl.Operation {
	return {
		status: 'created',
		oldRecord: undefined,
		newRecord: params.record as Scl.RawRecord<Scl.ElementsOf>,
	}
}

function writes(params: { operation: Scl.Operation; id: string }): boolean {
	const { operation, id } = params
	return operation.status !== 'deleted' && operation.newRecord.id === id
}
