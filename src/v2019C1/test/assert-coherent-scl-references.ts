import { SCL_NAMESPACES } from '@/v2019C1/config/dialecte.config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'
import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'

import type {
	AssertCoherentSclReferencesParams,
	AssertCoherentSclReferencesTestCasesParams,
	CollectReferenceViolationsParams,
	ReferenceViolation,
} from './assert-coherent-scl-references.types'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type { AnyRawRecord } from '@dialecte/core'

const SCL_NAMESPACE_URIS: readonly string[] = Object.values(SCL_NAMESPACES).map(
	(namespace) => namespace.uri,
)

/**
 * Every reference of a test XML document that a real file could not contain: a uuid that
 * points at nothing, or at an element the reference cannot target, or a written path that
 * is not the path of the element the uuid points at.
 */
export function collectReferenceViolations(
	params: CollectReferenceViolationsParams,
): ReferenceViolation[] {
	const { xml } = params

	const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
	const elements = [...xmlDocument.querySelectorAll('*')].filter(isSclElement)
	const elementsByUuid = indexByUuid(elements)

	return elements.flatMap((element) => collectElementViolations({ element, elementsByUuid }))
}

/**
 * Assert every reference of a test XML document is coherent. Throws with every violation
 * when one is not.
 */
export function assertCoherentSclReferences(params: AssertCoherentSclReferencesParams): void {
	const { xml, label = 'test XML' } = params
	const incoherentReason = describeIncoherentReferences({ xml, label })
	if (incoherentReason) throw new Error(incoherentReason)
}

/**
 * Check every case's `sourceXml`/`targetXml` and throw ONCE with the violations of all
 * incoherent cases, each attributed to its case name. A case that sets
 * `allowIncoherentReferences` is left unchecked.
 */
export function assertCoherentSclReferencesTestCases(
	params: AssertCoherentSclReferencesTestCasesParams,
): void {
	const { testCases } = params
	const incoherentReasons = Object.entries(testCases).flatMap(([name, testCase]) => {
		if (testCase.allowIncoherentReferences) return []
		const sourceReason = describeIncoherentReferences({
			xml: testCase.sourceXml,
			label: `${name} › sourceXml`,
		})
		const targetReason = testCase.targetXml
			? describeIncoherentReferences({ xml: testCase.targetXml, label: `${name} › targetXml` })
			: undefined
		return [sourceReason, targetReason].filter((reason) => reason !== undefined)
	})
	if (incoherentReasons.length > 0) throw new Error(incoherentReasons.join('\n'))
}

/** The reason the references of `xml` are incoherent — `undefined` when they are coherent. */
function describeIncoherentReferences(params: { xml: string; label: string }): string | undefined {
	const { xml, label } = params
	const violations = collectReferenceViolations({ xml })
	if (violations.length === 0) return undefined
	return `${label}: incoherent references:\n  ${violations.map(describeViolation).join('\n  ')}`
}

function describeViolation(violation: ReferenceViolation): string {
	const reference = `<${violation.referenceTagName}>`
	switch (violation.kind) {
		case 'path':
			return `[path] ${reference} ${violation.pathAttribute}="${violation.written}" is not the path of the element ${violation.uuidAttribute}="${violation.uuid}" points at, which is "${violation.expected}"`
		case 'dangling':
			return `[dangling] ${reference} ${violation.uuidAttribute}="${violation.uuid}" points at no element of the document`
		case 'wrong-target':
			return `[wrong-target] ${reference} ${violation.uuidAttribute}="${violation.uuid}" points at a <${violation.targetTagName}>, which it cannot reference`
		case 'empty':
			return `[empty] ${reference} ${violation.uuidAttribute} is empty`
	}
}

function collectElementViolations(params: {
	element: Element
	elementsByUuid: ReadonlyMap<string, Element[]>
}): ReferenceViolation[] {
	const { element, elementsByUuid } = params

	const pairs: readonly ReferencePair[] | undefined =
		UUID_REFERENCE_PAIRS[element.localName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return []

	return pairs.flatMap((pair) => collectPairViolations({ element, pair, elementsByUuid }))
}

function collectPairViolations(params: {
	element: Element
	pair: ReferencePair
	elementsByUuid: ReadonlyMap<string, Element[]>
}): ReferenceViolation[] {
	const { element, pair, elementsByUuid } = params

	const uuid = element.getAttribute(pair.attribute.uuid)
	if (uuid === null) return []

	const uuidAttribute = pair.attribute.uuid
	const referenceTagName = element.localName

	if (uuid === '') return [{ kind: 'empty', referenceTagName, uuidAttribute }]

	const carriers = elementsByUuid.get(uuid) ?? []
	if (carriers.length === 0) return [{ kind: 'dangling', referenceTagName, uuidAttribute, uuid }]

	const targetTagNames: readonly string[] = pair.target
	const target = carriers.find((candidate) => targetTagNames.includes(candidate.localName))
	if (!target) {
		const targetTagName = carriers[0].localName
		return [{ kind: 'wrong-target', referenceTagName, uuidAttribute, uuid, targetTagName }]
	}

	if (!isPlainNamePath({ pair, target })) return []

	const written = element.getAttribute(pair.attribute.path)
	if (written === null) return []

	const expected = buildPathFromAncestry({
		record: toRawRecord(target),
		ancestry: ancestorsTopDown(target).map(toRawRecord),
	})
	if (!expected || expected.path === written) return []

	return [
		{
			kind: 'path',
			referenceTagName,
			pathAttribute: pair.attribute.path,
			uuidAttribute,
			uuid,
			written,
			expected: expected.path,
		},
	]
}

/**
 * A reference whose written path is the target's chain of names and nothing else: the pair
 * resolves directly, and the target is addressed by its name (not by a data or signal form).
 */
function isPlainNamePath(params: { pair: ReferencePair; target: Element }): boolean {
	const { pair, target } = params
	if (pair.resolution !== RESOLUTION_TYPE.direct) return false
	return PATH_EXTRACTION_CONFIG[target.localName]?.type === 'name'
}

function isSclElement(element: Element): boolean {
	return element.namespaceURI !== null && SCL_NAMESPACE_URIS.includes(element.namespaceURI)
}

function indexByUuid(elements: readonly Element[]): Map<string, Element[]> {
	const elementsByUuid = new Map<string, Element[]>()
	for (const element of elements) {
		const uuid = element.getAttribute('uuid')
		if (!uuid) continue
		const sameUuid = elementsByUuid.get(uuid) ?? []
		elementsByUuid.set(uuid, [...sameUuid, element])
	}
	return elementsByUuid
}

function ancestorsTopDown(element: Element): Element[] {
	const ancestors: Element[] = []
	let current = element.parentElement
	while (current) {
		ancestors.unshift(current)
		current = current.parentElement
	}
	return ancestors
}

/** The record shape the path builder reads: a tag and its attributes. */
function toRawRecord(element: Element): AnyRawRecord {
	return {
		id: '',
		tagName: element.localName,
		namespace: { prefix: element.prefix ?? '', uri: element.namespaceURI ?? '' },
		attributes: [...element.attributes].map((attribute) => ({
			name: attribute.localName,
			value: attribute.value,
		})),
		value: '',
		parent: null,
		children: [],
	}
}
