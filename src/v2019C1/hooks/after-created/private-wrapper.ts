import { toRawRecord } from '@dialecte/core/helpers'
import { invariant } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { readAttribute } from '@/v2019C1/helpers'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Places an element of another namespace than its parent's (the default namespace excepted) in the parent's
 * transparent wrapper whose `type` is the element's namespace prefix: the one of that type when the parent holds one —
 * never a wrapper of another type —, a new one otherwise. Nothing to do when a wrapper of that type above the parent
 * already wraps the context, or when the parent is a wrapper itself (the element is then moved into it).
 */
export async function wrapWithPrivateElementIfNeeded<
	GenericElement extends Scl.ElementsOf,
	// Bound to ElementsOf (not ParentsOf<GenericElement>): these helpers use records
	// purely structurally and don't enforce the parent-child relationship. The
	// ParentsOf<…> indexed-access bound made `query.findAncestors(parentRecord)` below
	// blow up into a ~143-way union comparison (≈half of scl's whole-program check time).
	GenericParentElement extends Scl.ElementsOf,
>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	parentRecord: Scl.RawRecord<GenericParentElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, parentRecord, query } = params

	if (childRecord.namespace.prefix === SCL_DIALECTE_CONFIG.namespaces.default.prefix) {
		return []
	}

	if (isTransparentElement(parentRecord.tagName)) {
		return handleParentAsPrivateRecordCase({ parentRecord, childRecord, query })
	}
	// an element of the parent's own namespace sits in it directly
	if (parentRecord.namespace.uri === childRecord.namespace.uri) return []

	const updatedParentRecord: Scl.RawRecord<GenericParentElement> = {
		...parentRecord,
		children: parentRecord.children.filter((childRef) => childRef.id !== childRecord.id),
	}

	const existingPrivateRef = await findPrivateOfType({
		parentRecord,
		type: childRecord.namespace.prefix,
		query,
	})
	if (existingPrivateRef) {
		return handleExistingPrivateRecordCase({
			existingPrivateRef,
			parentRecord,
			updatedParentRecord,
			childRecord,
			query,
		})
	}

	// No Private of its type — check if a matching Private ancestor already wraps this context.
	// Walk up from parent: if any ancestor is Private with matching type, the element can be
	// placed directly without creating a new wrapper.
	const ancestors = await query.findAncestors(parentRecord)
	const hasMatchingAncestor = ancestors.some(
		(ancestor) =>
			ancestor.tagName === 'Private' &&
			readAttribute({ record: ancestor, name: 'type', defaults: 'none' }) ===
				childRecord.namespace.prefix,
	)
	if (hasMatchingAncestor) return []

	return handleNewPrivateRecordCase({ parentRecord, updatedParentRecord, childRecord })
}

/** The parent's `Private` of the given `type`, when it holds one. */
async function findPrivateOfType<GenericParentElement extends Scl.ElementsOf>(params: {
	parentRecord: Scl.RawRecord<GenericParentElement>
	type: string
	query: Core.Query<Config>
}): Promise<Scl.ChildRelationship<GenericParentElement> | undefined> {
	const { parentRecord, type, query } = params
	const privateRefs = parentRecord.children.filter((childRef) =>
		isTransparentElement(childRef.tagName),
	)
	const privates = await query.any.getRecords(privateRefs)
	const index = privates.findIndex(
		(privateRecord) =>
			privateRecord !== undefined &&
			readAttribute({ record: privateRecord, name: 'type', defaults: 'none' }) === type,
	)
	return index === -1 ? undefined : privateRefs[index]
}

// ── Sub-case handlers ─────────────────────────────────────────────────────────

export async function handleParentAsPrivateRecordCase<
	GenericElement extends Scl.ElementsOf,
	// Bound to ElementsOf (not ParentsOf<GenericElement>): these helpers use records
	// purely structurally and don't enforce the parent-child relationship. The
	// ParentsOf<…> indexed-access bound made `query.findAncestors(parentRecord)` below
	// blow up into a ~143-way union comparison (≈half of scl's whole-program check time).
	GenericParentElement extends Scl.ElementsOf,
>(params: {
	parentRecord: Scl.RawRecord<GenericParentElement>
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { parentRecord, childRecord, query } = params
	const privateRecord = parentRecord as unknown as Scl.RawRecord<'Private'>

	if (
		childRecord.parent?.id === privateRecord.id &&
		(childRecord.parent?.tagName as string) === 'Private'
	) {
		return []
	}

	const latestPrivateRecord = await getLatestPrivateRecord({ privateId: privateRecord.id, query })

	invariant(latestPrivateRecord, {
		detail: 'Latest private record not found',
		key: 'ELEMENT_NOT_FOUND',
	})

	const { childRecord: updatedChild, privateRecord: updatedPrivate } = addChildToPrivate({
		privateRecord: latestPrivateRecord,
		childRecord,
	})

	return [
		{
			status: 'updated',
			oldRecord: toRawRecord(childRecord),
			newRecord: toRawRecord(updatedChild),
		},
		{
			status: 'updated',
			oldRecord: toRawRecord(latestPrivateRecord),
			newRecord: toRawRecord(updatedPrivate),
		},
	]
}

/** Move a created element into its parent's `Private` of the element's type, which the caller found. */
export async function handleExistingPrivateRecordCase<
	GenericElement extends Scl.ElementsOf,
	// Bound to ElementsOf (not ParentsOf<GenericElement>): these helpers use records
	// purely structurally and don't enforce the parent-child relationship. The
	// ParentsOf<…> indexed-access bound made `query.findAncestors(parentRecord)` below
	// blow up into a ~143-way union comparison (≈half of scl's whole-program check time).
	GenericParentElement extends Scl.ElementsOf,
>(params: {
	existingPrivateRef: Scl.ChildRelationship<GenericParentElement>
	parentRecord: Scl.RawRecord<GenericParentElement>
	updatedParentRecord: Scl.RawRecord<GenericParentElement>
	childRecord: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { existingPrivateRef, parentRecord, updatedParentRecord, childRecord, query } = params

	const latestPrivateRecord = await getLatestPrivateRecord({
		privateId: existingPrivateRef.id,
		query,
	})

	invariant(latestPrivateRecord, {
		detail: 'Latest private record not found',
		key: 'ELEMENT_NOT_FOUND',
	})

	const { childRecord: updatedChild, privateRecord: updatedPrivate } = addChildToPrivate({
		privateRecord: latestPrivateRecord,
		childRecord,
	})

	return [
		{
			status: 'updated',
			oldRecord: toRawRecord(childRecord),
			newRecord: toRawRecord(updatedChild),
		},
		{
			status: 'updated',
			oldRecord: toRawRecord(latestPrivateRecord),
			newRecord: toRawRecord(updatedPrivate),
		},
		{
			status: 'updated',
			oldRecord: toRawRecord(parentRecord),
			newRecord: toRawRecord(updatedParentRecord),
		},
	]
}

export function handleNewPrivateRecordCase<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	// Relaxed from ParentsOf<…> to ElementsOf for the same reason as the helpers above.
	GenericParentElement extends Core.ElementsOf<GenericConfig>,
>(params: {
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	updatedParentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
}): Core.Operation<GenericConfig>[] {
	const { parentRecord, updatedParentRecord, childRecord } = params

	const newPrivateRecord: Core.RawRecord<GenericConfig, 'Private'> = {
		id: crypto.randomUUID(),
		tagName: 'Private',
		namespace: SCL_DIALECTE_CONFIG.namespaces.default,
		attributes: [{ name: 'type', value: childRecord.namespace.prefix }],
		value: '',
		parent: { id: parentRecord.id, tagName: parentRecord.tagName },
		children: [{ id: childRecord.id, tagName: childRecord.tagName }],
	}

	const updatedChildRecord: Core.RawRecord<GenericConfig, GenericElement> = {
		...childRecord,
		parent: { id: newPrivateRecord.id, tagName: 'Private' },
	}

	const updatedParentRecordWithNewPrivate: Core.RawRecord<GenericConfig, GenericParentElement> = {
		...updatedParentRecord,
		children: [...updatedParentRecord.children, { id: newPrivateRecord.id, tagName: 'Private' }],
	}

	return [
		{ status: 'created', oldRecord: undefined, newRecord: toRawRecord(newPrivateRecord) },
		{
			status: 'updated',
			oldRecord: toRawRecord(childRecord),
			newRecord: toRawRecord(updatedChildRecord),
		},
		{
			status: 'updated',
			oldRecord: toRawRecord(parentRecord),
			newRecord: toRawRecord(updatedParentRecordWithNewPrivate),
		},
	]
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export async function getLatestPrivateRecord<GenericConfig extends Core.AnyDialecteConfig>(params: {
	privateId: string
	query: Core.Query<GenericConfig>
}): Promise<Core.TrackedRecord<GenericConfig, 'Private'> | undefined> {
	const { privateId, query } = params
	return await query.getRecord({ id: privateId, tagName: 'Private' as const })
}

export function addChildToPrivate<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
>(params: {
	privateRecord: Core.RawRecord<GenericConfig, 'Private'>
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
}): {
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	privateRecord: Core.RawRecord<GenericConfig, 'Private'>
} {
	const { privateRecord, childRecord } = params

	const updatedChildRecord: Core.RawRecord<GenericConfig, GenericElement> = {
		...childRecord,
		parent: { id: privateRecord.id, tagName: 'Private' },
	}

	const updatedPrivateRecord: Core.RawRecord<GenericConfig, 'Private'> = {
		...privateRecord,
		children: [...privateRecord.children, { id: childRecord.id, tagName: childRecord.tagName }],
	}

	return { childRecord: updatedChildRecord, privateRecord: updatedPrivateRecord }
}
