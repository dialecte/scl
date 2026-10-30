import { DEFINITION } from '@/v2019C1/definition/definition.generated'

import type { SclXsdCode } from './assert-scl-output.types'

/**
 * The checks run on a document a test leaves, in the order they run. The validator is the verdict; the others are
 * the fast first signal and name the element the way the engine reads it.
 */
export const SCL_OUTPUT_CHECK = {
	/** Namespace per context, allowed child, known attribute (the bar test fixtures are held to). */
	schema: 'schema',
	/** The XSD validator on the exported document: values, required content, keys and key references. */
	xsd: 'xsd',
	/** Two children of one parent with one key, for the parent's unique and key constraints. */
	uniqueness: 'uniqueness',
	/** A uuid reference that points at nothing or at the wrong element, or a written path that disagrees. */
	references: 'references',
	/** A uuid used twice, a template uuid shared across element types or naming another type. */
	identity: 'identity',
} as const

/** The list of what the validator expected where it found a wrong or missing child: it depends on the siblings. */
export const XSD_EXPECTED_LIST = / Expected is .*$/

/** The pattern the schema gives a uuid, as it declares the file's own uuid. */
export const UUID_PATTERNS: readonly string[] =
	DEFINITION.Header.attributes.details.uuid.type.facets.pattern.flat()

/** The validator refusing an attribute value for its pattern: element, attribute, value, pattern. */
export const XSD_PATTERN_REFUSAL =
	/^Element '([^']+)', attribute '([^']+)': \[facet 'pattern'\] The value '([^']*)' is not accepted by the pattern '([^']*)'\.$/

/** The validator's note that a key could not read a value it refused already (the refusal is reported). */
export const XSD_UNREAD_KEY_VALUE_NOTE =
	/^Element '[^']+', attribute '[^']+': Warning: No precomputed value available/

/**
 * A test uuid: lowercase letters, digits and dashes. The readable uuids a test writes (`function-source-uuid`, in its
 * fixtures or in its act) and the counter the test runner mints during an act (`0`, `1`, `2`...) have this form; a
 * name or a path with a capital or a slash, or an empty value, written into a uuid attribute does not.
 */
export const TEST_UUID = /^[a-z0-9-]+$/

/**
 * The Header a test document is given when it has none: a hand-made fixture leaves it out, and without it the
 * validator checks nothing past the root's first child.
 */
export const TEST_HEADER = { id: 'test', uuid: 'ffffffff-ffff-4fff-bfff-ffffffffffff' } as const

/** The kinds of finding of the XSD validator, each with the start of its messages. */
export const SCL_XSD_CODE = {
	pattern: 'pattern',
	value: 'value',
	missingChild: 'missing-child',
	unexpectedChild: 'unexpected-child',
	requiredAttribute: 'required-attribute',
	unknownAttribute: 'unknown-attribute',
	duplicateKey: 'duplicate-key',
	keyref: 'keyref',
	other: 'other',
} as const

/** How each kind of finding reads in the validator's message, tried in this order. */
export const SCL_XSD_CODE_MESSAGES: readonly (readonly [SclXsdCode, RegExp])[] = [
	[SCL_XSD_CODE.pattern, /\[facet 'pattern'\]/],
	[SCL_XSD_CODE.missingChild, /Missing child element/],
	[SCL_XSD_CODE.unexpectedChild, /This element is not expected/],
	[SCL_XSD_CODE.requiredAttribute, /is required but missing/],
	[SCL_XSD_CODE.unknownAttribute, /The attribute '[^']*' is not allowed/],
	[SCL_XSD_CODE.duplicateKey, /Duplicate key-sequence/],
	[SCL_XSD_CODE.keyref, /No match found for key-sequence/],
	[SCL_XSD_CODE.value, /is not a valid value|\[facet '/],
]

/** The bracketed kind the structural check writes first on each of its lines (`[namespace] …`). */
export const SCHEMA_LINE_CODE = /^\[([a-z-]+)\]/

/** The kind of a line of the structural check that starts with none. */
export const SCHEMA_LINE_CODE_UNKNOWN = 'other'
