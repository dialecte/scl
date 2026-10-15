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
	/**
	 * A reference whose path and whose uuid name two different elements: the uuid wins, the path is
	 * written from the element it names.
	 */
	'incoherent-reference': {
		message: 'A reference names one element by its path and another by its uuid',
	},
	/**
	 * Names written from a path (a terminal's level names, a connectivity node's path name) disagree
	 * with that path: they are written again from it.
	 */
	'incoherent-path-names': {
		message: 'Names written from a path disagree with that path',
	},
	/**
	 * An LNode bound to an IED had no specified naming: it was given one from the logical node it is
	 * bound to (prefix, class, instance).
	 */
	'derived-specification-naming': {
		message:
			'A logical node had no specified naming: it was taken from the logical node it is bound to',
	},
} as const

/** A `type` of {@link SCL_IMPORT_WARNINGS}. */
export type SclImportWarningType = keyof typeof SCL_IMPORT_WARNINGS
