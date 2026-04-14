import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'

import type * as Core from '@dialecte/core'

/**
 * Enforces the presence of a valid UUID attribute on elements whose definition
 * supports one. If no UUID exists (or the value is empty), generates a new one.
 */
export function enforceUuidAttribute<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
>(params: {
	record: Core.RawRecord<GenericConfig, GenericElement>
}): Core.RawRecord<GenericConfig, GenericElement> {
	const { record } = params
	const { tagName, attributes } = record

	const definition =
		SCL_DIALECTE_CONFIG.definition[tagName as keyof typeof SCL_DIALECTE_CONFIG.definition]

	const supportsUuid = 'uuid' in definition.attributes.details
	if (!supportsUuid) return record

	const existingUuidAttribute = attributes.find((attribute) => attribute.name === 'uuid')
	if (existingUuidAttribute?.value) return record

	const uuidDef = definition.attributes.details.uuid as Core.AttributeDefinition | undefined
	const uuidNamespace = uuidDef?.namespace

	const filteredAttributes = attributes.filter((attribute) => attribute.name !== 'uuid')

	return {
		...record,
		attributes: [
			...filteredAttributes,
			{
				name: 'uuid' as Core.AttributesOf<GenericConfig, GenericElement>,
				value: crypto.randomUUID(),
				namespace: uuidNamespace,
			},
		] as Core.RawRecord<GenericConfig, GenericElement>['attributes'],
	}
}
