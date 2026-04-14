import { toRawRecord } from '@dialecte/core/helpers'
import { assert } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type * as Core from '@dialecte/core'

/**
 *
 * Wraps elements with a non-default namespace into a Private element.
 * Routes to the appropriate sub-case in private-wrapper.ts.
 */
export async function wrapWithPrivateElementIfNeeded<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	query: Core.Query<GenericConfig>
}): Promise<Core.Operation<GenericConfig>[]> {
	const { childRecord, parentRecord, query } = params

	if (childRecord.namespace.prefix === SCL_DIALECTE_CONFIG.namespaces.default.prefix) {
		return []
	}

	const isParentRecordPrivate = (parentRecord.tagName as string) === 'Private'
	const isParentInDefaultNamespace =
		parentRecord.namespace.prefix === SCL_DIALECTE_CONFIG.namespaces.default.prefix
	if (!isParentRecordPrivate && !isParentInDefaultNamespace) {
		return []
	}

	const existingPrivateRef = parentRecord.children.find((child) => child.tagName === 'Private')

	const updatedParentRecord: Core.RawRecord<GenericConfig, GenericParentElement> = {
		...parentRecord,
		children: parentRecord.children.filter((childRef) => childRef.id !== childRecord.id),
	}

	if (isParentRecordPrivate) {
		return handleParentAsPrivateRecordCase({ parentRecord, childRecord, query })
	} else if (existingPrivateRef) {
		return handleExistingPrivateRecordCase({
			existingPrivateRef,
			parentRecord,
			updatedParentRecord,
			childRecord,
			query,
		})
	}

	return handleNewPrivateRecordCase({ parentRecord, updatedParentRecord, childRecord })
}

// ── Sub-case handlers ─────────────────────────────────────────────────────────

export async function handleParentAsPrivateRecordCase<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	query: Core.Query<GenericConfig>
}): Promise<Core.Operation<GenericConfig>[]> {
	const { parentRecord, childRecord, query } = params
	const privateRecord = parentRecord as unknown as Core.RawRecord<GenericConfig, 'Private'>

	if (childRecord.parent?.id === privateRecord.id && childRecord.parent?.tagName === 'Private') {
		return []
	}

	const latestPrivateRecord = await getLatestPrivateRecord({ privateId: privateRecord.id, query })

	assert(latestPrivateRecord, {
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

export async function handleExistingPrivateRecordCase<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	existingPrivateRef: Core.ChildRelationship<GenericConfig, GenericParentElement>
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	updatedParentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	query: Core.Query<GenericConfig>
}): Promise<Core.Operation<GenericConfig>[]> {
	const { existingPrivateRef, parentRecord, updatedParentRecord, childRecord, query } = params

	const latestPrivateRecord = await getLatestPrivateRecord({
		privateId: existingPrivateRef.id,
		query,
	})

	assert(latestPrivateRecord, {
		detail: 'Latest private record not found',
		key: 'ELEMENT_NOT_FOUND',
	})

	const hasMatchingType = latestPrivateRecord.attributes.some(
		(attribute: Core.AnyAttribute) =>
			attribute.name === 'type' && attribute.value === childRecord.namespace.prefix,
	)

	if (!hasMatchingType) return []

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
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
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
