import {
	DOCTYPE_OPEN,
	ENTITY_REFERENCE,
	NAME_END,
	PREDEFINED_ENTITIES,
	PROLOG_PARTS,
	WHITE_SPACE,
	XML_NAMESPACE,
} from './fixture-root.constants'

import type {
	FixtureRoot,
	FixtureRootAttribute,
	FixtureXmlParams,
	ResolvedName,
	ResolveNameParams,
	ScannedName,
	ScanState,
	WrittenAttribute,
} from './fixture-root.types'

/**
 * A document's root element, read from its start tag as XML reads it: the XML declaration, processing instructions,
 * comments and a document type declaration before it skipped; attribute values in single or double quotes, a `>` inside
 * one, entity references decoded; the prefixes of the element and its attributes resolved through the namespaces the
 * root declares. `undefined` when the text holds no well-formed root start tag. Reads the start tag only, not what the
 * root holds.
 *
 * @intent read the root element of a fixture's XML text, its attributes and namespaces, without a full parse
 */
export function readFixtureRoot(params: FixtureXmlParams): FixtureRoot | undefined {
	const { xml } = params
	const rootAt = afterProlog({ xml, at: xml.startsWith('\uFEFF') ? 1 : 0 })
	if (rootAt === undefined || xml[rootAt] !== '<') return undefined
	const name = readName({ xml, at: rootAt + 1 })
	if (name.value === '') return undefined
	const written = readAttributes({ xml, at: name.at })
	if (!written) return undefined
	const namespaces = declaredNamespaces(written)
	const attributes = written.map(function resolvedAttribute(attribute): FixtureRootAttribute {
		const resolved = isNamespaceDeclaration(attribute.name)
			? { prefix: undefined, local: attribute.name, uri: '' }
			: resolveName({ name: attribute.name, namespaces, isElement: false })
		return { name: attribute.name, value: attribute.value, ...resolved }
	})
	return { ...resolveName({ name: name.value, namespaces, isElement: true }), attributes }
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
		return attribute.prefix === undefined && attribute.local === 'version'
	})
}

/** Where the root may start, past what may precede it; `undefined` when a part is left unclosed. */
function afterProlog(state: ScanState): number | undefined {
	const at = afterWhiteSpace(state)
	const part = PROLOG_PARTS.find(function opensHere(candidate) {
		return state.xml.startsWith(candidate.open, at)
	})
	if (part) {
		const end = state.xml.indexOf(part.close, at + part.open.length)
		return end < 0 ? undefined : afterProlog({ xml: state.xml, at: end + part.close.length })
	}
	if (!state.xml.startsWith(DOCTYPE_OPEN, at)) return at
	const end = doctypeEnd({ xml: state.xml, at: at + DOCTYPE_OPEN.length })
	return end === undefined ? undefined : afterProlog({ xml: state.xml, at: end + 1 })
}

/** The closing `>` of a document type declaration, past its internal subset and the quoted literals in it. */
function doctypeEnd(state: ScanState): number | undefined {
	let depth = 0
	for (let at = state.at; at < state.xml.length; at++) {
		const character = state.xml[at]
		if (character === '"' || character === "'") {
			const end = state.xml.indexOf(character, at + 1)
			if (end < 0) return undefined
			at = end
		} else if (character === '[') depth++
		else if (character === ']') depth--
		else if (character === '>' && depth === 0) return at
	}
	return undefined
}

/** The attributes of the start tag up to its `>` or `/>`; `undefined` when the tag is not well-formed. */
function readAttributes(state: ScanState): WrittenAttribute[] | undefined {
	const { xml } = state
	const attributes: WrittenAttribute[] = []
	let at = state.at
	for (;;) {
		const spacedAt = afterWhiteSpace({ xml, at })
		if (xml[spacedAt] === '>' || xml.startsWith('/>', spacedAt)) return attributes
		if (spacedAt === at) return undefined
		const name = readName({ xml, at: spacedAt })
		if (name.value === '') return undefined
		const equalsAt = afterWhiteSpace({ xml, at: name.at })
		if (xml[equalsAt] !== '=') return undefined
		const quoteAt = afterWhiteSpace({ xml, at: equalsAt + 1 })
		const quote = xml[quoteAt]
		if (quote !== '"' && quote !== "'") return undefined
		const end = xml.indexOf(quote, quoteAt + 1)
		if (end < 0) return undefined
		attributes.push({ name: name.value, value: decodeEntities(xml.slice(quoteAt + 1, end)) })
		at = end + 1
	}
}

/** The name starting where the state stands, up to the first character that ends a name, and where it ends. */
function readName(state: ScanState): ScannedName {
	let at = state.at
	while (at < state.xml.length && !NAME_END.test(state.xml[at])) at++
	return { value: state.xml.slice(state.at, at), at }
}

/** Where the white space starting where the state stands ends. */
function afterWhiteSpace(state: ScanState): number {
	let at = state.at
	while (at < state.xml.length && WHITE_SPACE.test(state.xml[at])) at++
	return at
}

function decodeEntities(value: string): string {
	return value.replace(ENTITY_REFERENCE, function decoded(reference, entity: string) {
		if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
		if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
		return PREDEFINED_ENTITIES[entity] ?? reference
	})
}

function isNamespaceDeclaration(name: string): boolean {
	return name === 'xmlns' || name.startsWith('xmlns:')
}

/** The namespaces the root declares, by prefix; the default one under `''`. */
function declaredNamespaces(attributes: readonly WrittenAttribute[]): ReadonlyMap<string, string> {
	const namespaces = new Map<string, string>()
	for (const { name, value } of attributes) {
		if (name === 'xmlns') namespaces.set('', value)
		else if (name.startsWith('xmlns:')) namespaces.set(name.slice('xmlns:'.length), value)
	}
	return namespaces
}

/**
 * A qualified name split at its prefix, with the namespace the prefix binds on the root: an unprefixed element takes
 * the default namespace, an unprefixed attribute none, a prefix the root binds to nothing `''`.
 */
function resolveName(params: ResolveNameParams): ResolvedName {
	const { name, namespaces, isElement } = params
	const colon = name.indexOf(':')
	if (colon < 0)
		return { prefix: undefined, local: name, uri: isElement ? (namespaces.get('') ?? '') : '' }
	const prefix = name.slice(0, colon)
	const uri = prefix === 'xml' ? XML_NAMESPACE : (namespaces.get(prefix) ?? '')
	return { prefix, local: name.slice(colon + 1), uri }
}
