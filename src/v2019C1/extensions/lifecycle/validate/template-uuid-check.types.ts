import type { AnyRefOrRecord } from '@dialecte/core'

/** Diagnostic codes emitted by {@link checkTemplateUuids}. */
export type TemplateUuidWarningCode =
	| 'cross-type-template-uuid'
	| 'duplicate-instance-uuid'
	| 'template-uuid-type-mismatch'

/**
 * An SCL identity-integrity warning. Each code is a DEFINITIVE invariant
 * violation, not a heuristic:
 *  - `cross-type-template-uuid`: one `templateUuid` on elements of ≥2 element TYPES (a templateUuid
 *    identifies a single template element, hence a single type);
 *  - `duplicate-instance-uuid`: a `uuid` used by ≥2 elements ("every instance UUID shall be unique");
 *  - `template-uuid-type-mismatch`: a `templateUuid` that resolves IN-FILE to an element of a
 *    different type than the bearer.
 * Reported per offending value.
 */
export type TemplateUuidWarning = {
	code: TemplateUuidWarningCode
	level: 'warning'
	/** The offending `uuid` / `templateUuid` value. */
	value: string
	/** The distinct element types involved (the evidence of the violation). */
	tagNames: string[]
	/** Every element involved (for select/highlight in a consumer UI). */
	refs: AnyRefOrRecord[]
	/** Number of elements involved. */
	count: number
	/** Human-readable explanation. */
	message: string
}

/**
 * Per-CODE human copy for a {@link TemplateUuidWarning} — the source of truth a consumer UI renders
 * so the explanation never drifts from the checker. Where each `message` describes one offending
 * occurrence, this describes the violation CLASS and the recovery the lifecycle engine applies.
 */
export type TemplateUuidWarningInfo = {
	/** Short human title for the violation class. */
	title: string
	/** What the violation is, in plain terms (why the lineage cannot be trusted). */
	description: string
	/** How the engine still proceeds despite it (the recovery / fallback strategy). */
	fallback: string
}
