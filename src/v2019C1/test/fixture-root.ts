import { ROOT_READ } from './fixture-root.constants'
import { missingSclEditionAttributes } from './given-edition'

import sax from 'sax'

import type { FixtureRoot, FixtureXmlParams } from './fixture-root.types'
import type { SclEditionAttribute } from './given-edition.types'
import type { QualifiedTag } from 'sax'

/**
 * A document's root element, read from its start tag by a namespace-aware XML parser (the one core imports with): what
 * precedes the root (declaration, processing instructions, comments, document type) skipped, attribute values in either
 * quote, entities decoded, the prefixes resolved through the namespaces the root declares. The reading stops at the
 * root's start tag. `undefined` for a text holding no element; an error the parser reports up to the end of the root's
 * start tag (an unquoted value, an unbound prefix, a tag left open) is thrown.
 *
 * @intent read the root element of a fixture's XML text, its attributes and namespaces, without a full parse
 */
export function readFixtureRoot(params: FixtureXmlParams): FixtureRoot | undefined {
	const parser = sax.parser(true, { xmlns: true, position: false })
	const read: { root?: FixtureRoot } = {}
	// sax only records an error and reads on: refuse at once, so no text not well-formed is read as a root
	parser.onerror = function refuse(error) {
		throw error
	}
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
 * What a fixture's `SCL` root lacks of the SCL edition, as attributes of its own (unprefixed), one written empty
 * stating nothing (as the store guard reads it): `[]` when it states it whole, `version` among them for a
 * first-edition file. `undefined` for a text with no `SCL` root.
 *
 * @intent tell what a fixture root lacks of the SCL edition, find a first-edition fixture or one stating its version only
 */
export function missingSclEdition(params: FixtureXmlParams): SclEditionAttribute[] | undefined {
	const root = readFixtureRoot(params)
	if (root?.local !== 'SCL') return undefined
	return missingSclEditionAttributes({
		states: function statesOwn(name) {
			return root.attributes.some(
				(attribute) =>
					attribute.prefix === '' && attribute.local === name && attribute.value !== '',
			)
		},
	})
}
