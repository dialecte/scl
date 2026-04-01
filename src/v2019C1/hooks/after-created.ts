import { SCL_DIALECTE_CONFIG } from '../config/dialecte.config'

import { getRecord } from '@dialecte/core'
import { toRawRecord } from '@dialecte/core/helpers'
import { assert } from '@dialecte/core/utils'

import type * as Core from '@dialecte/core'

/**
 * This hook wrap created elements with non-default namespace into a Private element.
 */
export async function afterCreated<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	context: Core.Context<GenericConfig>
}): Promise<Core.Operation<GenericConfig>[]> {
	const { childRecord, parentRecord, context } = params

	// Only wrap if element has non-default namespace
	if (childRecord.namespace.prefix === SCL_DIALECTE_CONFIG.namespaces.default.prefix) {
		return []
	}

	// Only wrap at the namespace boundary: parent must be in the default namespace.
	// If the parent is already a non-default namespace element we are already inside
	// the Private wrapper — adding another one would produce nested Privates.
	const isParentRecordPrivate = (parentRecord.tagName as string) === 'Private'
	const isParentInDefaultNamespace =
		parentRecord.namespace.prefix === SCL_DIALECTE_CONFIG.namespaces.default.prefix
	if (!isParentRecordPrivate && !isParentInDefaultNamespace) {
		return []
	}

	// Parent is not Private, look for existing Private child with matching type
	const existingPrivateRef = parentRecord.children.find((child) => child.tagName === 'Private')

	const updatedParentRecord: Core.RawRecord<GenericConfig, GenericParentElement> = {
		...parentRecord,
		children: parentRecord.children.filter((childRef) => childRef.id !== childRecord.id),
	}

	// If parent is already Private, add child directly to it
	if (isParentRecordPrivate) {
		return handleParentAsPrivateRecordCase({ parentRecord, childRecord, context })
	} else if (existingPrivateRef) {
		return handleExistingPrivateRecordCase({
			existingPrivateRef,
			parentRecord,
			updatedParentRecord,
			childRecord,
			context,
		})
	}

	return handleNewPrivateRecordCase({ parentRecord, updatedParentRecord, childRecord })
}

async function getLatestPrivateRecord<GenericConfig extends Core.AnyDialecteConfig>(params: {
	privateId: string
	context: Core.Context<GenericConfig>
}): Promise<Core.TrackedRecord<GenericConfig, 'Private'> | undefined> {
	const { privateId, context } = params

	return await getRecord({
		context,
		ref: { id: privateId, tagName: 'Private' as const },
	})
}

// Helper to add child to Private record
function addChildToPrivate<
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

async function handleParentAsPrivateRecordCase<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	context: Core.Context<GenericConfig>
}): Promise<Core.Operation<GenericConfig>[]> {
	const { parentRecord, childRecord, context } = params
	const privateRecord = parentRecord as unknown as Core.RawRecord<GenericConfig, 'Private'>

	// Check if child's parent is already set to this Private element (e.g., during cloning)
	if (childRecord.parent?.id === privateRecord.id && childRecord.parent?.tagName === 'Private') {
		return []
	}

	const latestPrivateRecord = await getLatestPrivateRecord({ privateId: privateRecord.id, context })

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

async function handleExistingPrivateRecordCase<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	existingPrivateRef: Core.ChildRelationship<GenericConfig, GenericParentElement>
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	updatedParentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	context: Core.Context<GenericConfig>
}): Promise<Core.Operation<GenericConfig>[]> {
	const { existingPrivateRef, parentRecord, updatedParentRecord, childRecord, context } = params
	const latestPrivateRecord = await getLatestPrivateRecord({
		privateId: existingPrivateRef.id,
		context,
	})

	assert(latestPrivateRecord, {
		detail: 'Latest private record not found',
		key: 'ELEMENT_NOT_FOUND',
	})

	const hasMatchingType = latestPrivateRecord.attributes.some(
		(attribute: Core.AnyAttribute) =>
			attribute.name === 'type' && attribute.value === childRecord.namespace.prefix,
	)

	if (!hasMatchingType) {
		return []
	}

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

function handleNewPrivateRecordCase<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	updatedParentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
}): Core.Operation<GenericConfig>[] {
	const { parentRecord, updatedParentRecord, childRecord } = params

	// Create new Private element
	const newPrivateRecord: Core.RawRecord<GenericConfig, 'Private'> = {
		id: crypto.randomUUID(),
		tagName: 'Private',
		namespace: SCL_DIALECTE_CONFIG.namespaces.default,
		attributes: [
			{
				name: 'type',
				value: childRecord.namespace.prefix,
			},
		],
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
		children: [
			// Remove the child from parent since it's now inside Private
			...updatedParentRecord.children,
			{ id: newPrivateRecord.id, tagName: 'Private' },
		],
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
