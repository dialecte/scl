import { throwDialecteError } from '@dialecte/core'
import { isSchemaDefaultValue } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import {
	DERIVED_ATTRIBUTES_BY_TAG,
	TYPE_ID_REF_ATTRIBUTES,
} from '@/v2019C1/extensions/reference/constants'

import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { ResolvableRecord } from '@dialecte/core/utils'

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
 * everything except identity (`uuid`/`templateUuid`/`originUuid`), reference attributes,
 * type references (`lnType`, `type`: an id of the element's own document, compared by the type
 * it names — see `typeChangesOf`), the attributes the element writes from a path (a terminal's
 * level names, a connectivity node's `pathName`), which follow where the element sits — and
 * `name` when the names are the project's (`namesFollow: 'project'`, an instance of a template);
 * a revision's renames are compared and written (`namesFollow: 'source'`, a fork).
 */
export function visibleAttributes(params: {
	/** The element: its tag, and its parent for the rules of its definition there. */
	record: ResolvableRecord
	attributes: Record<string, string>
	namesFollow: NamesFollow
}): Record<string, string> {
	const { record, attributes, namesFollow } = params
	const { tagName } = record
	const derived = DERIVED_ATTRIBUTES_BY_TAG.get(tagName)?.attributes ?? []
	const typeReferences = TYPE_ID_REF_ATTRIBUTES.get(tagName) ?? []
	const namesCompared = comparesNames(namesFollow)
	const visible: Record<string, string> = {}
	for (const [name, value] of Object.entries(attributes)) {
		if (IDENTITY_ATTRS.has(name) || REFERENCE_ATTRS.has(name)) continue
		if (typeReferences.includes(name)) continue
		if (name === 'name' && !namesCompared) continue
		if (derived.some((attribute) => attribute.name === name)) continue
		// a value equal to the schema default reads as the attribute left out: `lnInst=""` and no `lnInst` are one
		if (
			isSchemaDefaultValue({
				dialecteConfig: SCL_DIALECTE_CONFIG,
				record,
				attributeName: name,
				value,
			})
		)
			continue
		visible[name] = value
	}
	return visible
}

/** Whether a name takes part in the comparison: when the names follow the source. */
function comparesNames(namesFollow: NamesFollow): boolean {
	switch (namesFollow) {
		case 'project':
			return false
		case 'source':
			return true
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `visibleAttributes: unhandled names rule ${String(namesFollow satisfies never)}`,
			})
	}
}
