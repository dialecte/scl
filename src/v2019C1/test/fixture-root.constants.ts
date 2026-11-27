/** What may come before a document's root element, each skipped from its opening to its closing delimiter. */
export const PROLOG_PARTS = [
	{ open: '<?', close: '?>' },
	{ open: '<!--', close: '-->' },
] as const

/** A document type declaration: skipped to its closing `>`, an internal subset in `[` `]` included. */
export const DOCTYPE_OPEN = '<!DOCTYPE'

/** The five entities XML predefines, as an attribute value may write them. */
export const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
	lt: '<',
	gt: '>',
	amp: '&',
	quot: '"',
	apos: "'",
}

/** An entity or character reference inside an attribute value. */
export const ENTITY_REFERENCE = /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z_][\w.-]*);/g

/** The characters that end a name inside a start tag. */
export const NAME_END = /[\s=/>]/

/** XML white space. */
export const WHITE_SPACE = /\s/

/** The namespace the `xml` prefix is bound to by definition. */
export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
