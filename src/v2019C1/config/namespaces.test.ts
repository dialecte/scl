import { DEFINITION, ROOT_ELEMENT } from '../definition'
import { SCL_NAMESPACES } from './dialecte.config'

import { describe, expect, it } from 'vitest'

type Namespace = { readonly prefix: string; readonly uri: string }
/** What the definition says of an element or a declaration: the namespace it and each of its attributes is in. */
type Way = {
	readonly namespace?: Namespace
	readonly attributes: {
		readonly details: Readonly<Record<string, { readonly namespace?: Namespace }>>
	}
	readonly declarations?: Readonly<Record<string, Way>>
}

// Core stores an xsi:type value with the prefix this config declares for the type's namespace; the generated types
// name each type with the prefix the definition gives it. They agree, or a type checked as one value is stored as another.
describe('the namespaces agree with the definition', () => {
	const elements = Object.values(DEFINITION as Readonly<Record<string, Way>>)

	it("the default namespace -> the root element's", () => {
		const root = (DEFINITION as Readonly<Record<string, Way>>)[ROOT_ELEMENT]
		expect(SCL_NAMESPACES.default.uri).toBe(root?.namespace?.uri ?? '')
	})

	it('a namespace the definition gives a prefix, but the default one -> declared, with that prefix', () => {
		const declared = Object.values(SCL_NAMESPACES as Readonly<Record<string, Namespace>>)
		const prefixed = elements
			.flatMap((element) => [element, ...Object.values(element.declarations ?? {})])
			.flatMap((way) => [
				way.namespace,
				...Object.values(way.attributes.details).map((attribute) => attribute.namespace),
			])
			// the root's namespace is the default one, even where its schema writes it with a prefix
			.filter(
				(namespace): namespace is Namespace =>
					Boolean(namespace?.prefix) && namespace?.uri !== SCL_NAMESPACES.default.uri,
			)
		const missing = prefixed.filter(
			(namespace) =>
				!declared.some(({ prefix, uri }) => prefix === namespace.prefix && uri === namespace.uri),
		)
		expect([...new Set(missing.map(({ prefix, uri }) => `${prefix} = ${uri}`))]).toEqual([])
	})
})
