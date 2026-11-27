import { ROOT_READ } from './fixture-root.constants'

import sax from 'sax'

import type { FixtureRoot, FixtureXmlParams } from './fixture-root.types'
import type { QualifiedTag } from 'sax'

/**
 * A document's root element, read from its start tag by a namespace-aware XML parser (the one core imports with): what
 * precedes the root (declaration, processing instructions, comments, document type) skipped, attribute values in either
 * quote, entities decoded, the prefixes resolved through the namespaces the root declares. The reading stops at the
 * root's start tag. `undefined` for a text holding no element; a text not well-formed before the root ends throws the
 * parser's error.
 *
 * @intent read the root element of a fixture's XML text, its attributes and namespaces, without a full parse
 */
export function readFixtureRoot(params: FixtureXmlParams): FixtureRoot | undefined {
	const parser = sax.parser(true, { xmlns: true, position: false })
	const read: { root?: FixtureRoot } = {}
	parser.onopentag = function readRoot(tag) {
		const { name, prefix, local, uri, attributes } = tag as QualifiedTag
		read.root = { name, prefix, local, uri, attributes: Object.values(attributes) }
		throw ROOT_READ
	}
	try {
		parser.write(params.xml).close()
	} catch (error) {
		if (error !== ROOT_READ) throw error
	}
	return read.root
}

/**
 * Whether a fixture's `SCL` root states no SCL version of its own (an unprefixed `version`): a first-edition file. A
 * text with no `SCL` root states nothing to refuse.
 *
 * @intent tell whether an SCL fixture is a first-edition file, its root stating no SCL version
 */
export function statesNoSclVersion(params: FixtureXmlParams): boolean {
	const root = readFixtureRoot(params)
	if (root?.local !== 'SCL') return false
	return !root.attributes.some(function isSclVersion(attribute) {
		return attribute.prefix === '' && attribute.local === 'version'
	})
}
