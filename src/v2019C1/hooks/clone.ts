import type * as Core from '@dialecte/core'

export function beforeClone<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
>(params: {
	record: Core.ChainRecord<GenericConfig, GenericElement>
}): Core.ChainRecord<GenericConfig, GenericElement> {
	const { record } = params

	// Remove all UUID attributes from cloned element
	const filteredAttributes = record.attributes.filter(
		(attribute: Core.AnyAttribute) => attribute.name !== 'uuid',
	)

	return {
		...record,
		attributes: filteredAttributes,
	}
}
