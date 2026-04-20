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
