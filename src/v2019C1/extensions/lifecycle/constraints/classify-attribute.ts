import { EDITABLE_MODES, LINEAGE } from './classify-attribute.constants'
import { getIdentityFields } from './identity-fields'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { ATTRIBUTES } from '@/v2019C1/definition/constants.generated'
import { PATH_CONTRIBUTING_ATTRIBUTES } from '@/v2019C1/extensions/reference'

import type { AttributeEditability, EditableAttribute } from './classify-attribute.types'

/**
 * Classify how the UI may treat an attribute of an element during a lifecycle
 * transaction (schema-derived, no hardcoded element rules):
 *
 *  - lineage (`uuid`/`templateUuid`/`originUuid`) -> `identity`;
 *  - a reference path/uuid attribute (from `UUID_REFERENCE_PAIRS`) -> `reference`
 *    (system-owned, remapped automatically);
 *  - `name` -> `rename` (the mutable label; changing it triggers a managed ref-path
 *    rebuild — 61850-6 §8.5.6: the uuid is fixed, the name evolves);
 *  - any other path-contributing attribute (lnClass, prefix, inst, …) or scoped-key
 *    field -> `identity` (intrinsic; changing it is a delete+create, not an edit);
 *  - everything else -> `free`.
 */
export function classifyAttribute(tag: string, attr: string): AttributeEditability {
	if (LINEAGE.has(attr)) return 'identity'
	if (referenceAttributesOf(tag).has(attr)) return 'reference'
	if (attr === 'name') return 'rename'
	if (PATH_CONTRIBUTING_ATTRIBUTES.has(attr) || getIdentityFields(tag).has(attr)) return 'identity'
	return 'free'
}

/** Whether a classified attribute is user-editable (`rename` or `free`). */
export function isEditableMode(
	mode: AttributeEditability,
): mode is (typeof EDITABLE_MODES)[number] {
	return (EDITABLE_MODES as readonly string[]).includes(mode)
}

/**
 * The attributes of `tag` the UI may edit with no harmful side effect, each with its
 * edit mode. `rename` triggers a managed remap; `free` has no side effect. Identity
 * and reference attributes are omitted (nothing to show as editable).
 */
export function editableAttributes(tag: string): EditableAttribute[] {
	const attrs = Object.keys((ATTRIBUTES as Record<string, object>)[tag] ?? {})
	const out: EditableAttribute[] = []
	for (const attr of attrs) {
		const mode = classifyAttribute(tag, attr)
		if (isEditableMode(mode)) out.push({ attr, mode })
	}
	return out
}

function referenceAttributesOf(tag: string): ReadonlySet<string> {
	const pairs = UUID_REFERENCE_PAIRS[tag as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return EMPTY
	const set = new Set<string>()
	for (const pair of pairs) {
		set.add(pair.attribute.path)
		set.add(pair.attribute.uuid)
	}
	return set
}

const EMPTY: ReadonlySet<string> = new Set()
