import { defineErrors } from '@dialecte/core'

/**
 * The errors of the SCL dialecte, beside the core catalogue. Each is thrown as a structured
 * error: `key` and `code` identify the situation, `message` is the default wording, and `meta`
 * (listed for each key) says what it is about — a consumer builds its own wording from the key
 * and that data, and falls back to `message` for a key it does not know.
 *
 * `SCL1xxx` — lifecycle: the decisions and mapping choices a consumer passes.
 * `SCL2xxx` — lifecycle: what a template or a project must hold.
 * `SCL3xxx` — dataflow: a signal linked to an element that cannot implement it.
 */
export const SCL_ERRORS = defineErrors({
	/** A mapping choice for a source element the report does not list. `meta: { sourceId }` */
	MAPPING_CHOICE_UNKNOWN: {
		code: 'SCL1001',
		message: 'The choice concerns an element the template does not bring',
	},
	/** A mapping choice for an element whose mapping cannot be chosen. `meta: { sourceId, tagName }` */
	MAPPING_CHOICE_NOT_SELECTABLE: {
		code: 'SCL1002',
		message: 'Where an element of this kind lands cannot be chosen',
	},
	/** A mapping choice for a mapping the instance already carries. `meta: { sourceId, tagName }` */
	MAPPING_CHOICE_LOCKED: {
		code: 'SCL1003',
		message: 'The instance already carries the mapping of this element',
	},
	/**
	 * A mapping choice onto an element that is not a candidate.
	 * `meta: { sourceId, tagName, chosen: { tagName, id } }`
	 */
	MAPPING_CHOICE_NOT_A_CANDIDATE: {
		code: 'SCL1004',
		message: 'The element chosen is not one this element of the template can land on',
	},
	/**
	 * A write was asked while where an element of the template lands is the consumer's to choose.
	 * `meta: { sourceId, tagName, kind: 'level' | 'shared', operation? }`
	 */
	MAPPING_UNDECIDED: {
		code: 'SCL1005',
		message: 'Where an element of the template lands is not decided',
	},
	/** A group is accepted while a group it depends on is skipped. `meta: { groupId, dependencyId }` */
	DECISION_DEPENDENCY_SKIPPED: {
		code: 'SCL1006',
		message: 'A change is accepted while a change it depends on is skipped',
	},
	/** The template file holds nothing that can be instantiated. */
	TEMPLATE_ROOT_NOT_FOUND: {
		code: 'SCL2001',
		message: 'The template holds nothing that can be instantiated',
	},
	/** The project has no `Header` to record the source file in. */
	TARGET_HEADER_MISSING: {
		code: 'SCL2002',
		message: 'The project has no Header to record the source file in',
	},
	/**
	 * A signal linked to an element it cannot be implemented by (a `SourceRef` to an `ExtCtrl`).
	 * `meta: { signal: { tagName, id }, implementation: { tagName, id } }`
	 */
	DATAFLOW_LINK_TARGET_MISMATCH: {
		code: 'SCL3001',
		message: 'The signal cannot be implemented by an element of this kind',
	},
})

/** A key of {@link SCL_ERRORS}. */
export type SclErrorKey = keyof typeof SCL_ERRORS
