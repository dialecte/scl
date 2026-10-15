import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { DERIVED_ATTRIBUTES_BY_TAG } from '@/v2019C1/extensions/reference/constants'

const IDENTITY_ATTRS = new Set(['uuid', 'templateUuid', 'originUuid'])

/**
 * Reference attribute names (both the path and the uuid of every pair). These
 * are instance-remapped on instantiate/reconcile, so a raw same-space compare
 * would report spurious differences; references are reconciled separately (the
 * coherence pass / ref-remap), never as content. Derived from the schema.
 */
const REFERENCE_ATTRS: ReadonlySet<string> = new Set(
	Object.values(UUID_REFERENCE_PAIRS).flatMap((pairs) =>
		pairs.flatMap((pair) => [pair.attribute.path, pair.attribute.uuid]),
	),
)

/**
 * The attributes that take part in the same-space content diff/reconcile:
 * everything except identity (`uuid`/`templateUuid`/`originUuid`), the
 * project-owned `name`, reference attributes, and the attributes the element writes
 * from a path (a terminal's level names, a connectivity node's `pathName`), which follow
 * where the element sits.
 */
export function visibleAttributes(params: {
	tagName: string
	attributes: Record<string, string>
}): Record<string, string> {
	const { tagName, attributes } = params
	const derived = DERIVED_ATTRIBUTES_BY_TAG.get(tagName)?.attributes ?? []
	const visible: Record<string, string> = {}
	for (const [name, value] of Object.entries(attributes)) {
		if (IDENTITY_ATTRS.has(name) || name === 'name' || REFERENCE_ATTRS.has(name)) continue
		if (derived.some((attribute) => attribute.name === name)) continue
		visible[name] = value
	}
	return visible
}
