/**
 * The warnings an import of an SCL file may report, by their `type` (`ImportWarning.type`), each
 * with its default wording. What a warning is about is in its `details` (the element, the
 * attributes and the values concerned): a consumer builds its own wording from the type and that
 * data, and falls back to `message` for a type it does not know.
 */
export const SCL_IMPORT_WARNINGS = {
	/** A reference written as a path names no element of the file: its uuid is left unset. */
	'unresolved-reference': {
		message: 'A reference names an element the file does not hold',
	},
	/** A reference written in a form that is not resolved: its uuid is left unset. */
	'unsupported-xpath-reference': {
		message: 'A reference is written in a form that is not resolved',
	},
	/** A reference whose path and whose uuid name two different elements: both are kept as read. */
	'incoherent-reference': {
		message: 'A reference names one element by its path and another by its uuid',
	},
} as const

/** A `type` of {@link SCL_IMPORT_WARNINGS}. */
export type SclImportWarningType = keyof typeof SCL_IMPORT_WARNINGS
