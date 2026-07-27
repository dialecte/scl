import { isElementOf } from '@dialecte/core/helpers'

import { SCL_DIALECTE_CONFIG, SCL_NAMESPACES } from '@/v2019C1/config'

import type { Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * URIs of every namespace our schema registers. For these we own the complete
 * element set, so an element in one of them that is not in the definition is a
 * deprecated/unknown one (e.g. `SsdReference`, superseded by `SclFileReference` in
 * 2019C1) and must not be carried into a clone. Derived from `SCL_NAMESPACES` so a
 * newly registered namespace is covered automatically. Foreign/vendor namespaces
 * are not registered here and pass through verbatim.
 */
const SUPPORTED_ELEMENT_NAMESPACE_URIS: ReadonlySet<string> = new Set(
	Object.values(SCL_NAMESPACES).map((namespace) => namespace.uri),
)

/**
 * Prefixes of every namespace our schema registers. A `Private` whose `type` names
 * one of these is a wrapper we own (not a vendor flag), so an empty one carries no
 * information and is dropped. Derived from `SCL_NAMESPACES`; empty prefixes (the
 * default namespace) are excluded so an anonymous `type=""` is not matched here.
 */
const SUPPORTED_NAMESPACE_PREFIXES: ReadonlySet<string> = new Set(
	Object.values(SCL_NAMESPACES)
		.map((namespace) => namespace.prefix)
		.filter(Boolean),
)

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
	const typeValue = record.attributes.find((attribute) => attribute.name === 'type')?.value
	const hasType = typeValue !== undefined
	if (record.tagName === 'Private' && !record.tree.length && !hasValue && !hasType) {
		shouldBeCloned = false
	}

	// Drop an empty `Private` that wraps a namespace we own (its `type` is one of our
	// registered prefixes): unlike a vendor flag, such a wrapper is meaningless with
	// no content. Vendor-typed empty privates are preserved.
	if (
		record.tagName === 'Private' &&
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
		record.tagName === 'Private' &&
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
