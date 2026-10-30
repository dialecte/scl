import type { DiagnosticCatalogue } from '@dialecte/core'

/**
 * What the import of an SCL file may say about it, by `code` (`Diagnostic.code`, under `source:
 * 'scl'`), each with its severity, its family and its default wording. What a diagnostic is about
 * is in its `ref` (the element, and the attribute when it is about one), its `meta` (the values
 * concerned) and, for an incoherent reference, its `related` (the elements involved): a consumer
 * builds its own wording from the code and that data, and falls back to `message` for a code it
 * does not know.
 *
 * A `warning` says the file is not what it says: a reference is left without its uuid, or its path
 * is written again from the element its uuid names. An `information` says the file was corrected:
 * nothing is wrong after the import.
 */
export const SCL_IMPORT_DIAGNOSTICS = {
	source: 'scl',
	codes: {
		/** A reference written as a path names no element of the file: its uuid is left unset. */
		'unresolved-reference': {
			severity: 'warning',
			family: 'reference',
			message: 'A reference names an element the file does not hold',
		},
		/** A reference written in a form that is not resolved: its uuid is left unset. */
		'unsupported-xpath-reference': {
			severity: 'warning',
			family: 'reference',
			message: 'A reference is written in a form that is not resolved',
		},
		/**
		 * A reference whose path (its names, for one of the IED section named by attributes) and whose
		 * uuid name two different elements: the uuid wins, the path or names are written from the
		 * element it names. A reference of the IED section is left as read when that element is one it
		 * cannot point at, or when no names can name every uuid it holds and keep its other names.
		 */
		'incoherent-reference': {
			severity: 'warning',
			family: 'reference',
			message: 'A reference names one element by its path and another by its uuid',
		},
		/**
		 * A reference written with the path of an LNode could not be given the data-object name a data
		 * reference by uuid carries (the data model of the file does not split the path): it is left as
		 * read, without the uuid.
		 */
		'data-path-not-split': {
			severity: 'warning',
			family: 'reference',
			message: 'The data path of a reference is not split by the data model of the file',
		},
		/**
		 * Names written from a path (a terminal's level names, a connectivity node's path name) disagree
		 * with that path: they are written again from it.
		 */
		'incoherent-path-names': {
			severity: 'information',
			family: 'import',
			message: 'Names written from a path disagree with that path',
		},
		/**
		 * An LNode bound to an IED had no specified naming: it was given one from the logical node it is
		 * bound to (prefix, class, instance).
		 */
		'derived-specification-naming': {
			severity: 'information',
			family: 'import',
			message:
				'A logical node had no specified naming: it was taken from the logical node it is bound to',
		},
	},
} as const satisfies DiagnosticCatalogue

/** What `related` says of each element an incoherent reference involves. */
export const INCOHERENT_REFERENCE_RELATED = {
	uuidTarget: 'The element the uuid names',
	pathTarget: 'The element the path names',
} as const
