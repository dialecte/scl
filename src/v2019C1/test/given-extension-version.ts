import { readFixtureRoot } from './fixture-root'
import { assertRootOptInReason } from './given-edition'
import { EXTENSION } from './given-extension-version.constants'
import { CURRENT_6_100_VERSION } from './scl-xmlns.constants'

import type {
	AssertGivenExtensionVersionsParams,
	GivenXml,
	GivenXmlOfParams,
	LacksExtensionVersionParams,
} from './given-extension-version.types'

/**
 * Whether a document carries the eIEC61850-6-100 namespace (declared on its root or below it) while its `SCL` root states
 * not the extension's version (`<prefix>:version`, the prefix the root binds to the namespace). A document not carrying
 * the namespace, or with no `SCL` root, lacks nothing. Reads the XML text only: the root's start tag, parsed
 * (`readFixtureRoot`).
 *
 * @intent tell whether an SCL fixture carrying the 6-100 extension states its version on its root
 */
export function lacksExtensionVersion(params: LacksExtensionVersionParams): boolean {
	const { xml } = params
	if (!xml.includes(`"${EXTENSION.uri}"`) && !xml.includes(`'${EXTENSION.uri}'`)) return false
	const root = readFixtureRoot({ xml })
	if (root?.local !== 'SCL') return false
	return !root.attributes.some(function isExtensionVersion(attribute) {
		return attribute.uri === EXTENSION.uri && attribute.local === 'version'
	})
}

/**
 * Refuse a case whose given document carries the eIEC61850-6-100 namespace but whose root states not the extension's
 * version, unless the case says why (`noExtensionVersion`, with the reason); refuse the opt-out without a reason, or when
 * no given document lacks the version. Every current fixture root states `CURRENT_6_100_VERSION`, as
 * `ALL_XMLNS_NAMESPACES` does. It reads the XML the case gives, not the store as `assertGivenEditions` and
 * `assertGivenDocuments` do: the text holds the namespace declarations as the case wrote them, a root declaring the
 * namespace with no content of it included.
 *
 * @intent check that a test fixture carrying the 6-100 extension states its version, allow one without it on purpose
 */
export function assertGivenExtensionVersions(params: AssertGivenExtensionVersionsParams): void {
	const { given, label, noExtensionVersion } = params
	assertRootOptInReason({ name: 'noExtensionVersion', reason: noExtensionVersion, label })
	const lacking = given.filter((document) => lacksExtensionVersion({ xml: document.xml }))
	if (noExtensionVersion !== undefined) {
		if (lacking.length > 0) return
		throw new Error(
			`${label}: noExtensionVersion is given but no given document lacks the ${EXTENSION.prefix} version: remove it`,
		)
	}
	const [first] = lacking
	if (!first) return
	throw new Error(
		`${label}: the ${first.role} document carries the ${EXTENSION.prefix} namespace but its root states not its version: a current file states ${CURRENT_6_100_VERSION} (ALL_XMLNS_NAMESPACES does); a root without it on purpose sets noExtensionVersion with the reason`,
	)
}

/** A case's given documents as their XML: the source, then the target when the case has one. */
export function givenXmlOf(params: GivenXmlOfParams): GivenXml[] {
	const { sourceXml, targetXml } = params
	const given: GivenXml[] = [{ role: 'source', xml: sourceXml }]
	if (targetXml) given.push({ role: 'target', xml: targetXml })
	return given
}
