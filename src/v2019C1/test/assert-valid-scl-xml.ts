import { DEFINITION } from '@/v2019C1/definition/definition.generated'

type Namespace = { uri: string }
type ElementDef = {
	namespace?: Namespace
	attributes?: {
		sequence?: readonly string[]
		details?: Record<string, { required?: boolean } | undefined>
	}
	children?: {
		sequence?: readonly string[]
		any?: boolean
		details?: Record<string, { namespace?: Namespace } | undefined>
	}
}
const DEFS = DEFINITION as unknown as Record<string, ElementDef | undefined>

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
		? DEFS[parentLocalName]?.children?.details?.[childLocalName]?.namespace
		: undefined
	return (contextual ?? DEFS[childLocalName]?.namespace)?.uri
}

function isAllowedChild(parentDef: ElementDef, childLocalName: string): boolean {
	const children = parentDef.children
	if (!children) return false
	if (children.any === true) return true
	if (children.sequence?.includes(childLocalName)) return true
	return children.details ? childLocalName in children.details : false
}

/** Attribute names the element may carry, per the schema (sequence ∪ detail keys). */
function allowedAttributes(def: ElementDef): Set<string> {
	return new Set([
		...(def.attributes?.sequence ?? []),
		...Object.keys(def.attributes?.details ?? {}),
	])
}

/**
 * Assert a test XML string is valid SCL, structurally: every element's namespace matches its parent
 * context, every element is an allowed child of its parent, and every attribute is a known attribute of
 * its element. Elements/parents unknown to the schema are skipped (bespoke content under a transparent
 * `Private`, or dev-namespace scaffolding).
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
	options: { requireComplete?: boolean } = {},
): void {
	const requireComplete = options.requireComplete ?? true
	const doc = new DOMParser().parseFromString(xml, 'application/xml')
	const parseError = doc.querySelector('parsererror')
	if (parseError) throw new Error(`${label}: malformed XML — ${parseError.textContent?.trim()}`)

	const violations: string[] = []
	const visit = (element: Element, parentLocalName: string | undefined): void => {
		const localName = element.localName
		const def = DEFS[localName]

		// 1. namespace (context-aware)
		const expectedNs = expectedNamespaceUri(parentLocalName, localName)
		if (expectedNs !== undefined && element.namespaceURI !== expectedNs) {
			const where = parentLocalName ? ` under <${parentLocalName}>` : ''
			violations.push(
				`[namespace] <${element.tagName}>${where}: is in ${element.namespaceURI ?? '(no namespace)'}, schema declares ${expectedNs}`,
			)
		}

		// 2. containment
		const parentDef = parentLocalName ? DEFS[parentLocalName] : undefined
		if (parentDef && !isAllowedChild(parentDef, localName)) {
			violations.push(`[containment] <${localName}> is not a valid child of <${parentLocalName}>`)
		}

		// 3. attributes (known + required), only for schema-known elements
		if (def?.attributes) {
			const allowed = allowedAttributes(def)
			for (const attr of Array.from(element.attributes)) {
				// Skip namespaced attributes: xmlns/xsi, and the dev-namespaced test record id
				// (`CUSTOM_RECORD_ID_ATTRIBUTE`). Only unprefixed SCL attributes are validated.
				if (attr.namespaceURI !== null) continue
				if (!allowed.has(attr.localName)) {
					violations.push(`[attribute] <${localName}> has unknown attribute '${attr.localName}'`)
				}
			}
			if (requireComplete) {
				for (const [attrName, rule] of Object.entries(def.attributes.details ?? {})) {
					if (rule?.required && !element.hasAttribute(attrName)) {
						violations.push(`[required] <${localName}> is missing required attribute '${attrName}'`)
					}
				}
			}
		}

		for (const child of Array.from(element.children)) visit(child, localName)
	}
	if (doc.documentElement) visit(doc.documentElement, undefined)

	if (violations.length > 0) {
		throw new Error(`${label}: not valid SCL:\n  ${violations.join('\n  ')}`)
	}
}
