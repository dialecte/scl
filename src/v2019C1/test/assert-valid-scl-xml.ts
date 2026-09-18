import { SCL_NAMESPACES } from '@/v2019C1/config/dialecte.config'
import { DEFINITION } from '@/v2019C1/definition/definition.generated'

import type {
	AssertValidSclTestCasesParams,
	AssertValidSclXmlOptions,
	CollectAttributeViolationsParams,
	CollectElementViolationsParams,
	DescribeInvalidSclXmlParams,
	SchemaElementDefinition,
} from './assert-valid-scl-xml.types'

const ELEMENT_DEFINITIONS = DEFINITION as unknown as Record<
	string,
	SchemaElementDefinition | undefined
>

const KNOWN_NAMESPACE_URIS: readonly string[] = Object.values(SCL_NAMESPACES).map(
	(namespace) => namespace.uri,
)

/**
 * An element living in a namespace the SCL config does not declare (vendor content under a `Private`,
 * dev-namespace scaffolding). Its local name may collide with a schema element (a vendor `Address`,
 * `P`, `Val`…), so it must never be looked up in the schema by local name: it is opaque to the
 * validator. An element in NO namespace is not foreign — it is a schema element the snippet forgot to
 * put in its namespace, and stays validated.
 */
function isForeignNamespaceElement(element: Element): boolean {
	return element.namespaceURI !== null && !KNOWN_NAMESPACE_URIS.includes(element.namespaceURI)
}

/**
 * The namespace URI the SCL schema expects for a `<child>` element appearing under `<parent>`.
 *
 * SCL reuses local element names across namespaces (e.g. `SclFileReference` is default-namespace under
 * an IED but `eIEC61850-6-100` under a `FunctionSclRef`), so the authoritative source is the
 * **contextual** `parent.children.details[child].namespace`, falling back to the child's own primary
 * `namespace` when the parent declares no override. `undefined` when the tag is unknown to the schema.
 */
function expectedNamespaceUri(
	parentLocalName: string | undefined,
	childLocalName: string,
): string | undefined {
	const contextual = parentLocalName
		? ELEMENT_DEFINITIONS[parentLocalName]?.children?.details?.[childLocalName]?.namespace
		: undefined
	return (contextual ?? ELEMENT_DEFINITIONS[childLocalName]?.namespace)?.uri
}

function isAllowedChild(
	parentDefinition: SchemaElementDefinition,
	childLocalName: string,
): boolean {
	const children = parentDefinition.children
	if (!children) return false
	if (children.any === true) return true
	if (children.sequence?.includes(childLocalName)) return true
	return children.details ? childLocalName in children.details : false
}

/** Attribute names the element may carry, per the schema (sequence ∪ detail keys). */
function allowedAttributes(definition: SchemaElementDefinition): Set<string> {
	return new Set([
		...(definition.attributes?.sequence ?? []),
		...Object.keys(definition.attributes?.details ?? {}),
	])
}

function collectAttributeViolations(params: CollectAttributeViolationsParams): string[] {
	const { element, definition, requireComplete } = params
	if (!definition.attributes) return []

	const allowed = allowedAttributes(definition)
	// Skip namespaced attributes: xmlns/xsi, and the dev-namespaced test record id
	// (`CUSTOM_RECORD_ID_ATTRIBUTE`). Only unprefixed SCL attributes are validated.
	const unknownAttributeViolations = Array.from(element.attributes)
		.filter((attribute) => attribute.namespaceURI === null && !allowed.has(attribute.localName))
		.map(
			(attribute) =>
				`[attribute] <${element.localName}> has unknown attribute '${attribute.localName}'`,
		)
	if (!requireComplete) return unknownAttributeViolations

	const missingAttributeViolations = Object.entries(definition.attributes.details ?? {})
		.filter(([attributeName, rule]) => rule?.required && !element.hasAttribute(attributeName))
		.map(
			([attributeName]) =>
				`[required] <${element.localName}> is missing required attribute '${attributeName}'`,
		)
	return [...unknownAttributeViolations, ...missingAttributeViolations]
}

function collectElementViolations(params: CollectElementViolationsParams): string[] {
	const { element, parentLocalName, requireComplete } = params
	const childElements = Array.from(element.children)

	// Opaque: not checked itself, and no parent context for its children — a schema element nested
	// inside is still validated on its own namespace and attributes.
	if (isForeignNamespaceElement(element)) {
		return childElements.flatMap((child) =>
			collectElementViolations({ element: child, parentLocalName: undefined, requireComplete }),
		)
	}

	const localName = element.localName
	const violations: string[] = []

	// 1. namespace (context-aware)
	const expectedNamespace = expectedNamespaceUri(parentLocalName, localName)
	if (expectedNamespace !== undefined && element.namespaceURI !== expectedNamespace) {
		const where = parentLocalName ? ` under <${parentLocalName}>` : ''
		violations.push(
			`[namespace] <${element.tagName}>${where}: is in ${element.namespaceURI ?? '(no namespace)'}, schema declares ${expectedNamespace}`,
		)
	}

	// 2. containment
	const parentDefinition = parentLocalName ? ELEMENT_DEFINITIONS[parentLocalName] : undefined
	if (parentDefinition && !isAllowedChild(parentDefinition, localName)) {
		violations.push(`[containment] <${localName}> is not a valid child of <${parentLocalName}>`)
	}

	// 3. attributes (known + required), only for schema-known elements
	const definition = ELEMENT_DEFINITIONS[localName]
	const attributeViolations = definition
		? collectAttributeViolations({ element, definition, requireComplete })
		: []

	const childViolations = childElements.flatMap((child) =>
		collectElementViolations({ element: child, parentLocalName: localName, requireComplete }),
	)
	return [...violations, ...attributeViolations, ...childViolations]
}

/** The reason `xml` is not valid SCL, ready to throw — `undefined` when it is valid. */
function describeInvalidSclXml(params: DescribeInvalidSclXmlParams): string | undefined {
	const { xml, label, requireComplete } = params

	// A template-literal snippet usually starts with a newline; an XML declaration after it is
	// malformed for every XML parser, with a message that does not say why. Say it.
	if (!xml.startsWith('<?xml') && xml.trimStart().startsWith('<?xml')) {
		return `${label}: malformed XML — the XML declaration must be the very first characters of the string: remove the declaration (a snippet does not need one) or the whitespace before it`
	}

	const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
	const parseError = xmlDocument.querySelector('parsererror')
	if (parseError) return `${label}: malformed XML — ${parseError.textContent?.trim()}`
	if (!xmlDocument.documentElement) return undefined

	const violations = collectElementViolations({
		element: xmlDocument.documentElement,
		parentLocalName: undefined,
		requireComplete,
	})
	return violations.length > 0
		? `${label}: not valid SCL:\n  ${violations.join('\n  ')}`
		: undefined
}

/**
 * Assert a test XML string is valid SCL, structurally: every element's namespace matches its parent
 * context, every element is an allowed child of its parent, and every attribute is a known attribute of
 * its element. Elements unknown to the schema are skipped (bespoke content under a transparent
 * `Private`), and so is any element in a namespace the SCL config does not declare — even when its
 * local name collides with a schema element.
 *
 * `requireComplete` (default `true`) additionally requires every schema-required attribute to be
 * present. Minimal test fixtures legitimately omit these (e.g. a bare `<SCL>` without
 * `version`/`revision`/`release`), so the harness runs with it OFF — structural correctness is
 * enforced, document completeness is not.
 *
 * NOT yet enforced (planned with the validation feature): attribute VALUE facets (uuid pattern, enums,
 * datatypes) and cross-element constraints (unique keys, keyref resolution).
 */
export function assertValidSclXml(
	xml: string,
	label = 'test XML',
	options: AssertValidSclXmlOptions = {},
): void {
	const requireComplete = options.requireComplete ?? true
	const invalidReason = describeInvalidSclXml({ xml, label, requireComplete })
	if (invalidReason) throw new Error(invalidReason)
}

/**
 * Validate every case's `sourceXml`/`targetXml` and throw ONCE with the violations of all invalid
 * cases, each attributed to its case name — so a suite's fixtures are fixed in one round instead of
 * one failure at a time.
 */
export function assertValidSclTestCases(params: AssertValidSclTestCasesParams): void {
	const { testCases } = params
	const invalidReasons = Object.entries(testCases).flatMap(([name, testCase]) => {
		const sourceReason = describeInvalidSclXml({
			xml: testCase.sourceXml,
			label: `${name} › sourceXml`,
			requireComplete: false,
		})
		const targetReason = testCase.targetXml
			? describeInvalidSclXml({
					xml: testCase.targetXml,
					label: `${name} › targetXml`,
					requireComplete: false,
				})
			: undefined
		return [sourceReason, targetReason].filter((reason) => reason !== undefined)
	})
	if (invalidReasons.length > 0) throw new Error(invalidReasons.join('\n'))
}
