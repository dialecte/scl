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
	/** A previous revision is given to an operation that is not a fork. `meta: { scenario }` */
	REVISION_BASE_WITHOUT_FORK: {
		code: 'SCL1007',
		message: 'A previous revision is given to an operation that is not a fork',
	},
	/**
	 * The previous revision given to a fork is another file: its Header names another file than the newer
	 * revision's. `meta: { fileUuid, baseFileUuid }`
	 */
	REVISION_BASE_OTHER_FILE: {
		code: 'SCL1008',
		message: 'The previous revision given is another file',
	},
	/**
	 * An option is given a value the operation does not offer yet (an extract writing a new revision of the file
	 * the element came from). `meta: { option, value }`
	 */
	OPTION_NOT_AVAILABLE: {
		code: 'SCL1009',
		message: 'This value of the option is not available yet',
	},
	/**
	 * An element written beside one of the project that shares with it every field of a key none of which can be
	 * changed (the key of a logical node: its class, instance, prefix, device and IED): two such elements in one place
	 * are invalid, whatever is numbered. `meta: { constraint, fields, element: { tagName, id }, collidesWith: { tagName,
	 * id } }` — `element` is the element the operation brings (as the template holds it when refused before any write,
	 * as written otherwise), `collidesWith` the element of the project.
	 */
	IDENTITY_COLLISION: {
		code: 'SCL1010',
		message: 'An element shares with another one in the same place a key that cannot be changed',
	},
	/** A decision is passed for a group the report does not list. `meta: { groupId }` */
	DECISION_UNKNOWN: {
		code: 'SCL1011',
		message: 'A decision concerns a change the report does not list',
	},
	/** A group of the report depends on a group the report does not list. `meta: { groupId, dependencyId }` */
	DECISION_DEPENDENCY_UNKNOWN: {
		code: 'SCL1012',
		message: 'A change depends on a change the report does not list',
	},
	/**
	 * A report is applied to another target than the one it was made for, or carries none (it was not made by
	 * `query.lifecycle.report`). `meta: { field }` — the first that differs: `report` (none), `document`, `source`,
	 * `verb`, `ref`, `anchor`, `scenario`, `targetInstance`.
	 */
	REPORT_TARGET_MISMATCH: {
		code: 'SCL1013',
		message: 'The report was made for another target',
	},
	/**
	 * A report names an element the document no longer holds: an instance it covers, an element a mapping lands on,
	 * an element a mapping choice names. `meta: { element: { tagName, id }, kind: 'instance' | 'mapping' }`
	 */
	REPORT_STALE: {
		code: 'SCL1014',
		message: 'The report names an element the document no longer holds',
	},
	/** The template file holds nothing that can be instantiated, or not the element an SSD operation names. */
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
	 * An SSD whose first named level holds several units, none of them chosen: the element named is the `TEMPLATE`
	 * scaffolding above them, or none is named. The consumer asks again naming one of them as `ref`.
	 * `meta: { candidates: [{ tagName, id, name }] }` — the units, as the template holds them.
	 */
	SSD_SCOPE_AMBIGUOUS: {
		code: 'SCL2003',
		message: 'The template holds several units: the one to act on is to be chosen',
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
