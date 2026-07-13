import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

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
 * project-owned `name`, and reference attributes.
 */
export function visibleAttributes(attributes: Record<string, string>): Record<string, string> {
	const visible: Record<string, string> = {}
	for (const [name, value] of Object.entries(attributes)) {
		if (IDENTITY_ATTRS.has(name) || name === 'name' || REFERENCE_ATTRS.has(name)) continue
		visible[name] = value
	}
	return visible
}
