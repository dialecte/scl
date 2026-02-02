import { SCL_DIALECTE_CONFIG } from '../config/dialecte.config'

import { toChainRecord, getLatestStagedRecord, toRawRecord } from '@dialecte/core'

import type * as Core from '@dialecte/core'

/**
 * This hook wrap created elements with non-default namespace into a Private element.
 */
export function afterCreated<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	context: Core.Context<GenericConfig, GenericParentElement>
}): Core.Operation<GenericConfig>[] {
	const { childRecord, parentRecord, context } = params

	// Only wrap if element has non-default namespace
	if (childRecord.namespace.prefix === SCL_DIALECTE_CONFIG.namespaces.default.prefix) {
		return []
	}

	// Helper to get latest staged version of a Private record
	function getLatestPrivateRecord(privateId: string):
		| {
				record: Core.RawRecord<GenericConfig, 'Private'>
				status: Core.Operation<GenericConfig>['status']
		  }
		| undefined {
		return getLatestStagedRecord({
			stagedOperations: context.stagedOperations,
			id: privateId,
			tagName: 'Private',
		})
	}

	// Helper to add child to Private record
	function addChildToPrivate(privateRecord: Core.RawRecord<GenericConfig, 'Private'>): {
		childRecord: Core.RawRecord<GenericConfig, GenericElement>
		privateRecord: Core.RawRecord<GenericConfig, 'Private'>
	} {
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

	const isParentRecordPrivate = (parentRecord.tagName as string) === 'Private'

	// If parent is already Private, add child directly to it
	if (isParentRecordPrivate) {
		const privateRecord = parentRecord as unknown as Core.RawRecord<GenericConfig, 'Private'>

		// Check if child's parent is already set to this Private element (e.g., during cloning)
		if (childRecord.parent?.id === privateRecord.id && childRecord.parent?.tagName === 'Private') {
			return []
		}

		const stagedPrivateRecord = getLatestPrivateRecord(privateRecord.id)
		const latestPrivateRecord =
			stagedPrivateRecord && stagedPrivateRecord.status !== 'deleted'
				? toChainRecord({ record: stagedPrivateRecord.record, status: stagedPrivateRecord.status })
				: privateRecord
		const { childRecord: updatedChild, privateRecord: updatedPrivate } =
			addChildToPrivate(latestPrivateRecord)

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

	// Parent is not Private, look for existing Private child with matching type
	const existingPrivateRef = parentRecord.children.find((child) => child.tagName === 'Private')

	if (existingPrivateRef) {
		const stagedPrivateRecord = getLatestPrivateRecord(existingPrivateRef.id)

		if (stagedPrivateRecord) {
			const latestPrivateRecord = toChainRecord({
				record: stagedPrivateRecord.record,
				status: stagedPrivateRecord.status,
			})

			const hasMatchingType = latestPrivateRecord.attributes.some(
				(attribute: Core.AnyAttribute) =>
					attribute.name === 'type' && attribute.value === childRecord.namespace.prefix,
			)

			if (hasMatchingType) {
				const { childRecord: updatedChild, privateRecord: updatedPrivate } =
					addChildToPrivate(latestPrivateRecord)

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
		}
	}

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

	const updatedParentRecord: Core.RawRecord<GenericConfig, GenericParentElement> = {
		...parentRecord,
		children: [...parentRecord.children, { id: newPrivateRecord.id, tagName: 'Private' }],
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
			newRecord: toRawRecord(updatedParentRecord),
		},
	]
}
