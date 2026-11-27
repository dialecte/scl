/** A fixture document, as its XML text. */
export type FixtureXmlParams = { xml: string }

/** An attribute of a root start tag: its qualified name split at the prefix, its namespace, its decoded value. */
export type FixtureRootAttribute = ResolvedName & {
	/** The name as written, prefix included. */
	name: string
	value: string
}

/** A document's root element, read from its start tag. */
export type FixtureRoot = ResolvedName & { attributes: readonly FixtureRootAttribute[] }

/** The text being read and where the reading stands. */
export type ScanState = { readonly xml: string; readonly at: number }

/** A name read from the text, and where it ends. */
export type ScannedName = { value: string; at: number }

/** An attribute as written in the start tag, before its namespace is resolved. */
export type WrittenAttribute = { name: string; value: string }

export type ResolveNameParams = {
	name: string
	namespaces: ReadonlyMap<string, string>
	isElement: boolean
}

/** A qualified name split at its prefix, with the namespace it is in. */
export type ResolvedName = { prefix: string | undefined; local: string; uri: string }
