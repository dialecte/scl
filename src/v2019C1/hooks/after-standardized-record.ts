import { SCL_DIALECTE_CONFIG } from '../config/dialecte.config'

import type * as Core from '@dialecte/core'

export function afterStandardizedRecord<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
>(params: {
	record: Core.RawRecord<GenericConfig, GenericElement>
}): Core.RawRecord<GenericConfig, GenericElement> {
	const { record } = params
	const { tagName, attributes } = record

	const definition = SCL_DIALECTE_CONFIG.definition[tagName]

	function enforceUuidAttribute(): Core.RawRecord<GenericConfig, GenericElement>['attributes'] {
		const supportsUuid = 'uuid' in definition.attributes.details
		if (!supportsUuid) return attributes

		const existingUuidAttribute = attributes.find((attribute) => attribute.name === 'uuid')
		const hasValidUuid = existingUuidAttribute?.value

		if (!hasValidUuid) {
			const uuidNamespace = definition.attributes.details.uuid?.namespace

			// Remove empty uuid if exists, then add new one
			const filteredAttributes = attributes.filter((attribute) => attribute.name !== 'uuid')

			return [
				...filteredAttributes,
				{
					name: 'uuid' as Core.AttributesOf<GenericConfig, GenericElement>,
					value: crypto.randomUUID(),
					namespace: uuidNamespace,
				},
			] as Core.RawRecord<GenericConfig, GenericElement>['attributes']
		}

		return attributes
	}

	const attributesWithUuid = enforceUuidAttribute()

	return {
		...record,
		attributes: attributesWithUuid,
	}
}
