import { chainOf } from './moved-roots'
import { PRIVATE_TAG, PRIVATE_TYPE_ATTRIBUTE } from './wrap-moved-roots.constants'

import { toRawRecord } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { readAttribute } from '@/v2019C1/helpers'
import {
	isOwnTransparentElement,
	isTransparentElement,
} from '@/v2019C1/helpers/transparent-elements'

import type { MovePlaces, MovedRef } from './moved-roots.types'
import type { MoveWrite } from './moves.types'
import type { WrapGroup, WrapWrites } from './wrap-moved-roots.types'
import type { Config } from '@/v2019C1/config'
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
): Promise<WrapWrites> {
	const groups = wrapGroupsOf(params)
	if (groups.length === 0) return { created: [], writes: [] }
	const privates = await readPrivates(query, { groups, pending: params.pending })
	const created: AnyRawRecord[] = []
	const writes = new Map<string, MoveWrite>()
	for (const group of groups) {
		const parent = writes.get(group.parent.id)?.newRecord ?? group.parent
		const wrapped = wrapOneGroup({ group, parent, privates })
		if (wrapped.created) created.push(wrapped.created)
		for (const write of wrapped.writes) {
			// one write per record: the parent of several groups as first read, as the last group leaves it
			const first = writes.get(write.newRecord.id)?.oldRecord ?? write.oldRecord
			writes.set(write.newRecord.id, { oldRecord: first, newRecord: write.newRecord })
		}
	}
	return { created, writes: [...writes.values()] }
}

/** The transparent wrappers the groups' parents hold, read once, each as the commit's earlier steps left it. */
async function readPrivates(
	query: Core.Query<Config>,
	params: { groups: readonly WrapGroup[]; pending: ReadonlyMap<string, AnyRawRecord> },
): Promise<Map<string, AnyRawRecord>> {
	const refs = new Map<string, { tagName: string; id: string }>()
	for (const group of params.groups) {
		for (const child of group.parent.children) {
			if (isTransparentElement(child.tagName)) refs.set(child.id, child)
		}
	}
	const privates = new Map<string, AnyRawRecord>()
	if (refs.size === 0) return privates
	for (const record of await query.any.getRecords([...refs.values()])) {
		// only an SCL Private takes the moved roots: a vendor's Private of another namespace is its own element
		if (record && isOwnTransparentElement({ record }))
			privates.set(
				record.id,
				params.pending.get(record.id) ?? (toRawRecord(record) as AnyRawRecord),
			)
	}
	return privates
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
		if (!child || !parent || isOwnTransparentElement({ record: parent })) continue
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
 * The writes placing one group in its parent's `Private` of its namespace, a new one when the parent holds none: each
 * child under it, the wrapper holding them, the parent without them (and with the new wrapper).
 */
function wrapOneGroup(params: {
	group: WrapGroup
	parent: AnyRawRecord
	privates: ReadonlyMap<string, AnyRawRecord>
}): { created: AnyRawRecord | undefined; writes: MoveWrite[] } {
	const { group, parent, privates } = params
	const refs: { id: string; tagName: string }[] = []
	for (const child of group.children) refs.push({ id: child.id, tagName: child.tagName })
	let existing: AnyRawRecord | undefined
	for (const child of parent.children) {
		const record = privates.get(child.id)
		if (
			record &&
			readAttribute({ record, name: PRIVATE_TYPE_ATTRIBUTE, defaults: 'none' }) === group.prefix
		) {
			existing = record
			break
		}
	}
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
	const moved = new Set<string>()
	for (const ref of refs) moved.add(ref.id)
	const kept: { id: string; tagName: string }[] = []
	for (const child of parent.children) if (!moved.has(child.id)) kept.push(child)
	if (!existing) kept.push({ id: wrapper.id, tagName: PRIVATE_TAG })
	const writes: MoveWrite[] = existing ? [{ oldRecord: existing, newRecord: wrapper }] : []
	for (const child of group.children) {
		writes.push({
			oldRecord: child,
			newRecord: { ...child, parent: { id: wrapper.id, tagName: PRIVATE_TAG } },
		})
	}
	// one parent write for all its groups: the last one, from the parent as first read
	writes.push({ oldRecord: group.parent, newRecord: { ...parent, children: kept } })
	return { created: existing ? undefined : wrapper, writes }
}
