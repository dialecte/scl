import type { TemplateUuidWarningCode } from '@/v2019C1/extensions/lifecycle/validate'

/**
 * The identity checks whose value is a placeholder, not a lineage: one `templateUuid` on elements of several types, or
 * one naming an element of another type. A duplicated `uuid` is no lineage value.
 */
export const PLACEHOLDER_LINEAGE_CODES: ReadonlySet<TemplateUuidWarningCode> = new Set([
	'cross-type-template-uuid',
	'template-uuid-type-mismatch',
])
