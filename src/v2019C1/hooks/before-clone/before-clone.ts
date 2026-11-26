import {
	SUPPORTED_ELEMENT_NAMESPACE_URIS,
	SUPPORTED_NAMESPACE_PREFIXES,
} from './before-clone.constants'

import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { readAttribute } from '@/v2019C1/helpers'
import { isOwnTransparentElement } from '@/v2019C1/helpers/transparent-elements'

import type { Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** True when `record` is in a supported namespace but our schema no longer defines it. */
function isUnknownSupportedNamespaceElement(record: Scl.TreeRecord<Scl.ElementsOf>): boolean {
	return (
		SUPPORTED_ELEMENT_NAMESPACE_URIS.has(record.namespace.uri) &&
		!isElementOf(record.tagName, SCL_DIALECTE_CONFIG)
	)
}

export function beforeClone<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.TreeRecord<GenericElement>
}): {
	shouldBeCloned: boolean
	transformedRecord: Scl.TreeRecord<GenericElement>
} {
	const { record } = params
	const genericRecord = record as unknown as Scl.TreeRecord<Scl.ElementsOf>

	let shouldBeCloned = true

	// Skip only truly-empty `Private` noise: no child elements, no text value, and no `type`.
	// Vendor privates carry information in their value or by their
	// mere presence with a `type`, so they must be cloned.
	const hasValue = !!record.value?.trim()
	const typeValue = readAttribute({
		record,
		name: 'type',
		defaults: 'none',
		fullObject: true,
	})?.value
	const hasType = typeValue !== undefined
	if (isOwnTransparentElement({ record }) && !record.tree.length && !hasValue && !hasType) {
		shouldBeCloned = false
	}

	// Drop an empty `Private` that wraps a namespace we own (its `type` is one of our
	// registered prefixes): unlike a vendor flag, such a wrapper is meaningless with
	// no content. Vendor-typed empty privates are preserved.
	if (
		isOwnTransparentElement({ record }) &&
		!record.tree.length &&
		!hasValue &&
		typeValue !== undefined &&
		SUPPORTED_NAMESPACE_PREFIXES.has(typeValue)
	) {
		shouldBeCloned = false
	}

	// Drop elements of a supported namespace that our schema no longer defines
	// (deprecated/unknown), together with the `Private` wrapper that held only them —
	// a wrapper left empty by the filter is stale noise. Foreign/vendor privates and
	// privates mixing in at least one known element are preserved.
	if (isUnknownSupportedNamespaceElement(genericRecord)) {
		shouldBeCloned = false
	}
	if (
		isOwnTransparentElement({ record }) &&
		genericRecord.tree.length > 0 &&
		genericRecord.tree.every(isUnknownSupportedNamespaceElement)
	) {
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
