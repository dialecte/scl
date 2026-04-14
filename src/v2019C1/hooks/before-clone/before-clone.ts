import type * as Core from '@dialecte/core'

export function beforeClone<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
>(params: {
	record: Core.TreeRecord<GenericConfig, GenericElement>
}): { shouldBeCloned: boolean; transformedRecord: Core.TreeRecord<GenericConfig, GenericElement> } {
	const { record } = params

	let shouldBeCloned = true

	if (record.tagName === 'Private' && !record.tree.length) {
		shouldBeCloned = false
	}

	// Remove all UUID attributes from cloned element
	const filteredAttributes = record.attributes.filter(
		(attribute: Core.AnyAttribute) => attribute.name !== 'uuid',
	)

	return {
		shouldBeCloned,
		transformedRecord: {
			...record,
			attributes: filteredAttributes,
		},
	}
}
