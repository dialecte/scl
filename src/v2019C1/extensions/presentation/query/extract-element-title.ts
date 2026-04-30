import { TITLE_FIELDS_OVERRIDE, TITLE_SEPARATORS } from '../constants/title'

import { DEFINITION } from '@/v2019C1/definition'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

// ── Public API ───────────────────────────────────────────────────────

/**
 * Query extension: extracts a human-readable title for an SCL element.
 *
 * Strategy:
 * 1. If the element has a title-field override, concatenate those attributes.
 * 2. Otherwise, use `name` > `id` > `inst` from identity fields.
 * 3. Fallback: tagName.
 */
export async function extractElementTitle(
	query: Core.Query<Config>,
	refOrRecord: AnyRefOrRecord,
): Promise<string> {
	const record = await query.getRecord(refOrRecord as Scl.Ref<Scl.ElementsOf>)
	if (!record) return ''

	const tag = record.tagName
	const attributes = await query.getAnyAttributes(record)

	// Check override map
	const overrideFields = TITLE_FIELDS_OVERRIDE[tag]
	if (overrideFields) {
		const separator = TITLE_SEPARATORS[tag] ?? ''
		const parts = overrideFields.map((field) => attributes[field]).filter(Boolean)
		return parts.length > 0 ? parts.join(separator) : tag
	}

	// Derive from identityFields in DEFINITION
	const definition = DEFINITION[tag as keyof typeof DEFINITION]
	const identityFields = (definition?.attributes as { identityFields?: string[] } | undefined)
		?.identityFields

	const preferred = identityFields?.find((f) => f === 'name' || f === 'id') ?? identityFields?.[0]
	if (preferred) return attributes[preferred] || tag

	return attributes['name'] || tag
}
