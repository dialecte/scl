import type { QualifiedAttribute, QualifiedTag } from 'sax'

/** A fixture document, as its XML text. */
export type FixtureXmlParams = { xml: string }

/**
 * A document's root element, read from its start tag: its qualified name split at the prefix (`''` for none), its
 * namespace, and its attributes, each with the namespace its prefix binds (`''` for an unprefixed one).
 */
export type FixtureRoot = Pick<QualifiedTag, 'name' | 'prefix' | 'local' | 'uri'> & {
	attributes: readonly QualifiedAttribute[]
}
