import { SCL_NAMESPACES } from '@/v2019C1/config'

/**
 * URIs of every namespace our schema registers. For these we own the complete
 * element set, so an element in one of them that is not in the definition is a
 * deprecated/unknown one (e.g. `SsdReference`, superseded by `SclFileReference` in
 * 2019C1) and must not be carried into a clone. Derived from `SCL_NAMESPACES` so a
 * newly registered namespace is covered automatically. Foreign/vendor namespaces
 * are not registered here and pass through verbatim.
 */
export const SUPPORTED_ELEMENT_NAMESPACE_URIS: ReadonlySet<string> = new Set(
	Object.values(SCL_NAMESPACES).map((namespace) => namespace.uri),
)

/**
 * Prefixes of every namespace our schema registers. A `Private` whose `type` names
 * one of these is a wrapper we own (not a vendor flag), so an empty one carries no
 * information and is dropped. Derived from `SCL_NAMESPACES`; empty prefixes (the
 * default namespace) are excluded so an anonymous `type=""` is not matched here.
 */
export const SUPPORTED_NAMESPACE_PREFIXES: ReadonlySet<string> = new Set(
	Object.values(SCL_NAMESPACES)
		.map((namespace) => namespace.prefix)
		.filter(Boolean),
)
