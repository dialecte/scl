import type { Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export function beforeClone<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.TreeRecord<GenericElement>
}): {
	shouldBeCloned: boolean
	transformedRecord: Scl.TreeRecord<GenericElement>
} {
	const { record } = params

	let shouldBeCloned = true

	// Skip only truly-empty `Private` noise: no child elements, no text value, and no `type`.
	// Vendor privates carry information in their value or by their
	// mere presence with a `type`, so they must be cloned.
	const hasValue = !!record.value?.trim()
	const hasType = record.attributes.some((attribute) => attribute.name === 'type')
	if (record.tagName === 'Private' && !record.tree.length && !hasValue && !hasType) {
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
