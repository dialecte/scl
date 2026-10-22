/**
 * Test setup of the `mutation` project: the browser globals the tests and the core API reach for, given to node.
 * From jsdom the XML parser, the serializer and a document for the export; XPath from the `xpath` package. The
 * browser `unit` project stays the reference: a test these cannot carry goes in `MUTATION_BROWSER_ONLY_TESTS`.
 */
// the store: the test helpers open core's local store, IndexedDB, given to node here; the one line a change of store
// touches
import 'fake-indexeddb/auto'
import { XMLNS_NAMESPACE } from './mutants.constants'

import { JSDOM } from 'jsdom'
import { isNodeLike, selectWithResolver } from 'xpath'

const { window } = new JSDOM('')

// a browser takes `setAttribute('xmlns', uri)` for the declaration it is (the export writes the root's so); jsdom
// keeps a plain attribute and serializes the declaration twice, which no parser accepts
const { setAttribute } = window.Element.prototype
window.Element.prototype.setAttribute = function setDeclarationOrAttribute(
	this: Element,
	name: string,
	value: string,
): void {
	if (name === 'xmlns' || name.startsWith('xmlns:'))
		return this.setAttributeNS(XMLNS_NAMESPACE, name, value)
	return setAttribute.call(this, name, value)
}

// jsdom's XPath ignores the namespace resolver and lower-cases names: no query of a namespaced XML document matches
window.Document.prototype.evaluate = function evaluateFirstNode(
	this: Document,
	expression: string,
	contextNode: Node,
	resolver?: XPathNSResolver | null,
	type?: number,
): XPathResult {
	if (type !== window.XPathResult.FIRST_ORDERED_NODE_TYPE)
		throw new Error(
			`the node stand-in of document.evaluate answers the first node only, not type ${type}`,
		)
	const found = selectWithResolver(expression, contextNode, toResolver({ resolver }), true)
	return {
		resultType: type,
		singleNodeValue: isNodeLike(found ?? null) ? found : null,
	} as XPathResult
}

Object.assign(globalThis, {
	DOMParser: window.DOMParser,
	XMLSerializer: window.XMLSerializer,
	XPathResult: window.XPathResult,
	document: window.document,
})

function toResolver(params: { resolver?: XPathNSResolver | null }): XPathNSResolver | null {
	const { resolver } = params
	if (typeof resolver !== 'function') return resolver ?? null
	return { lookupNamespaceURI: resolver }
}
