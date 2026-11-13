import { throwDialecteError } from '@dialecte/core'
import { isSchemaDefaultValue } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config/dialecte.config'
import { LINEAGE } from '@/v2019C1/extensions/lifecycle/constraints/classify-attribute.constants'
import {
	DERIVED_ATTRIBUTES_BY_TAG,
	TYPE_ID_REF_ATTRIBUTES,
} from '@/v2019C1/extensions/reference/constants'
import { REFERENCE_UUIDS_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'

import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { ResolvableRecord } from '@dialecte/core/utils'

/**
 * The attributes that take part in the same-space content diff/reconcile:
 * everything except identity (`uuid`/`templateUuid`/`originUuid`), the reference attributes of the element's tag
 * (see `referenceAttributesLeftOut`: instance-remapped on instantiate/reconcile, kept coherent by the hooks, never
 * content),
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
	/** The attributes of the element it is compared with: a tuple reference's names follow a uuid either side writes. */
	counterpartAttributes: Readonly<Record<string, string | undefined>>
	namesFollow: NamesFollow
}): Record<string, string> {
	const { record, attributes, counterpartAttributes, namesFollow } = params
	const { tagName } = record
	const references = referenceAttributesLeftOut({ tagName, attributes, counterpartAttributes })
	const derived = DERIVED_ATTRIBUTES_BY_TAG.get(tagName)?.attributes ?? []
	const typeReferences = TYPE_ID_REF_ATTRIBUTES.get(tagName) ?? []
	const namesCompared = comparesNames(namesFollow)
	const visible: Record<string, string> = {}
	for (const [name, value] of Object.entries(attributes)) {
		if (LINEAGE.has(name) || references.has(name)) continue
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

/**
 * The reference attributes of a tag left out of the comparison: every uuid, and the path written from it; a tuple
 * reference's names when either side writes the uuid they follow (a rename of the target then counts once, on the
 * target). Names neither side writes a uuid beside are the reference itself: compared.
 */
function referenceAttributesLeftOut(params: {
	tagName: string
	attributes: Readonly<Record<string, string | undefined>>
	counterpartAttributes: Readonly<Record<string, string | undefined>>
}): ReadonlySet<string> {
	const { tagName, attributes, counterpartAttributes } = params
	const references = REFERENCE_UUIDS_BY_TAG.get(tagName) ?? []
	return new Set(
		references.flatMap((reference) => {
			const followsUuid =
				reference.form === 'path' ||
				Boolean(attributes[reference.uuid] || counterpartAttributes[reference.uuid])
			return followsUuid ? [reference.uuid, ...reference.names] : [reference.uuid]
		}),
	)
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
