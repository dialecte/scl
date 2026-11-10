import {
	SCL_FIXTURE_READING_DIALECTE,
	SCL_NAMESPACE_URIS,
} from './assert-coherent-scl-references.constants'
import { treeEntriesOf } from './tree-entries'

import { ERROR_CATALOG, toDialecteError } from '@dialecte/core'
import { createTestProject } from '@dialecte/core/test'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference'
import { PATH_EXTRACTION_CONFIG } from '@/v2019C1/extensions/reference/constants/path-extraction'
import {
	composeDerivedAttributes,
	derivedAttributesFollowing,
} from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import { buildPathFromAncestry } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readAttribute } from '@/v2019C1/helpers'

import type {
	AssertCoherentSclReferencesParams,
	AssertCoherentSclReferencesTestCasesParams,
	CollectReferenceViolationsParams,
	CollectXmlReferenceViolationsParams,
	ReferenceViolation,
} from './assert-coherent-scl-references.types'
import type { TreeEntry } from './tree-entries.types'
import type { Config } from '@/v2019C1/config'
import type { DerivedAttributes, ReferencePair } from '@/v2019C1/extensions/reference'
import type { ElementPath } from '@/v2019C1/extensions/reference/query/build'
import type { AnyRawRecord, AnyTreeRecord } from '@dialecte/core'
import type { TestProjectResult } from '@dialecte/core/test'

/**
 * Every reference of a document that a real file could not contain: a uuid that points at nothing, or at an element
 * the reference cannot target, or a written path that is not the path of the element the uuid points at. Read on the
 * document's record tree (`query.getSnapshot({ as: 'tree' })`).
 */
export function collectReferenceViolations(
	params: CollectReferenceViolationsParams,
): ReferenceViolation[] {
	const { tree } = params

	const elements = treeEntriesOf(tree).filter(isSclElement)
	const elementsByUuid = indexByUuid(elements)

	return elements.flatMap((element) => collectElementViolations({ element, elementsByUuid }))
}

/**
 * Assert every reference of a test XML document is coherent: no empty uuid, no uuid pointing at nothing or at an
 * element the reference cannot target, no written path or derived attribute that disagrees with the element the uuid
 * points at.
 * Throws with every violation when one is not.
 *
 * @intent check a test fixture's references before using it, find dangling uuid references in SCL XML, assert written paths match their targets
 */
export async function assertCoherentSclReferences(
	params: AssertCoherentSclReferencesParams,
): Promise<void> {
	const { xml, label = 'test XML' } = params
	const incoherentReason = await describeIncoherentReferences({ xml, label })
	if (incoherentReason) throw new Error(incoherentReason)
}

/**
 * Check every case's `sourceXml`/`targetXml` and throw ONCE with the violations of all
 * incoherent cases, each attributed to its case name. A case that sets
 * `allowIncoherentReferences` is left unchecked.
 */
export async function assertCoherentSclReferencesTestCases(
	params: AssertCoherentSclReferencesTestCasesParams,
): Promise<void> {
	const { testCases } = params
	const checked = Object.entries(testCases).filter(
		([, testCase]) => !testCase.allowIncoherentReferences,
	)
	const reasons = await Promise.all(
		checked.flatMap(([name, testCase]) => [
			describeIncoherentReferences({ xml: testCase.sourceXml, label: `${name} › sourceXml` }),
			testCase.targetXml
				? describeIncoherentReferences({ xml: testCase.targetXml, label: `${name} › targetXml` })
				: undefined,
		]),
	)
	const incoherentReasons = reasons.filter((reason) => reason !== undefined)
	if (incoherentReasons.length > 0) throw new Error(incoherentReasons.join('\n'))
}

/**
 * Every incoherent reference of a test XML document as written (see {@link collectReferenceViolations}): none when
 * the text does not import, the structural check reports a malformed document.
 */
export async function collectXmlReferenceViolations(
	params: CollectXmlReferenceViolationsParams,
): Promise<ReferenceViolation[]> {
	const { xml } = params
	const tree = await readFixtureTree({ xml })
	return tree ? collectReferenceViolations({ tree }) : []
}

/** The reason the references of `xml` are incoherent — `undefined` when they are coherent. */
async function describeIncoherentReferences(params: {
	xml: string
	label: string
}): Promise<string | undefined> {
	const { xml, label } = params
	const violations = await collectXmlReferenceViolations({ xml })
	if (violations.length === 0) return undefined
	return `${label}: incoherent references:\n  ${violations.map(describeReferenceViolation).join('\n  ')}`
}

/**
 * The record tree of a test XML document as written: imported into a test project of its own with no hook, so
 * nothing fills or repairs a reference, then the project goes. `undefined` when the text is not well-formed XML: the
 * structural check reports it. Any other refusal of the import is thrown.
 */
async function readFixtureTree(params: { xml: string }): Promise<AnyTreeRecord | undefined> {
	const opened = await openFixture(params)
	if (!opened) return undefined
	try {
		return await opened.source.document.query.getSnapshot({ as: 'tree' })
	} finally {
		await opened.project.destroy()
	}
}

/** The fixture's own test project; `undefined` only when its text is not well-formed XML. */
async function openFixture(params: {
	xml: string
}): Promise<TestProjectResult<Config> | undefined> {
	try {
		return await createTestProject({
			dialecte: SCL_FIXTURE_READING_DIALECTE,
			sourceXml: params.xml,
		})
	} catch (error) {
		if (toDialecteError(error)?.code === ERROR_CATALOG.PARSE_ERROR.code) return undefined
		throw error
	}
}

/** One violation as one line: `[kind] <element> what is wrong`. */
export function describeReferenceViolation(violation: ReferenceViolation): string {
	const reference = `<${violation.kind === 'derived' ? violation.elementTagName : violation.referenceTagName}>`
	switch (violation.kind) {
		case 'path':
			return `[path] ${reference} ${violation.pathAttribute}="${violation.written}" is not the path of the element ${violation.uuidAttribute}="${violation.uuid}" points at, which is "${violation.expected}"`
		case 'dangling':
			return `[dangling] ${reference} ${violation.uuidAttribute}="${violation.uuid}" points at no element of the document`
		case 'wrong-target':
			return `[wrong-target] ${reference} ${violation.uuidAttribute}="${violation.uuid}" points at a <${violation.targetTagName}>, which it cannot reference`
		case 'derived':
			return `[derived] ${reference} ${violation.attribute}="${violation.written}" is not the value read on its path, which is ${violation.expected === undefined ? 'absent' : `"${violation.expected}"`}`
	}
}

function collectElementViolations(params: {
	element: TreeEntry
	elementsByUuid: ReadonlyMap<string, TreeEntry[]>
}): ReferenceViolation[] {
	const { element, elementsByUuid } = params

	const ownViolations = collectOwnPathViolations(element)
	const pairs: readonly ReferencePair[] | undefined =
		UUID_REFERENCE_PAIRS[element.record.tagName as keyof typeof UUID_REFERENCE_PAIRS]
	if (!pairs) return ownViolations

	return [
		...ownViolations,
		...pairs.flatMap((pair) => collectPairViolations({ element, pair, elementsByUuid })),
	]
}

function collectPairViolations(params: {
	element: TreeEntry
	pair: ReferencePair
	elementsByUuid: ReadonlyMap<string, TreeEntry[]>
}): ReferenceViolation[] {
	const { element, pair, elementsByUuid } = params

	const uuid = writtenAttribute({ record: element.record, name: pair.attribute.uuid })
	if (uuid === undefined) return []

	const uuidAttribute = pair.attribute.uuid
	const referenceTagName = element.record.tagName

	const carriers = elementsByUuid.get(uuid) ?? []
	if (carriers.length === 0) return [{ kind: 'dangling', referenceTagName, uuidAttribute, uuid }]

	const targetTagNames: readonly string[] = pair.target
	const target = carriers.find((candidate) => targetTagNames.includes(candidate.record.tagName))
	if (!target) {
		const targetTagName = carriers[0].record.tagName
		return [{ kind: 'wrong-target', referenceTagName, uuidAttribute, uuid, targetTagName }]
	}

	if (pair.resolution === RESOLUTION_TYPE.scopedName) {
		return collectScopedNameViolations({ element, pair, target, uuid })
	}
	if (!isPlainNamePath({ pair, target })) return []

	const expected = elementPathOf(target)
	if (!expected) return []

	const derived = derivedAttributesFollowing({
		tagName: referenceTagName,
		follows: pair.attribute.path,
	})
	const derivedViolations = derived
		? collectDerivedViolations({ element, derived, sourcePath: expected })
		: []

	const written = writtenAttribute({ record: element.record, name: pair.attribute.path })
	if (written === undefined || expected.path === written) return derivedViolations

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
		...derivedViolations,
	]
}

/** A reference naming its target by the target's name in its scope (a variant) that writes another. */
function collectScopedNameViolations(params: {
	element: TreeEntry
	pair: ReferencePair
	target: TreeEntry
	uuid: string
}): ReferenceViolation[] {
	const { element, pair, target, uuid } = params
	const written = writtenAttribute({ record: element.record, name: pair.attribute.path })
	const expected = writtenAttribute({ record: target.record, name: 'name' })
	if (written === undefined || expected === undefined || written === expected) return []
	return [
		{
			kind: 'path',
			referenceTagName: element.record.tagName,
			pathAttribute: pair.attribute.path,
			uuidAttribute: pair.attribute.uuid,
			uuid,
			written,
			expected,
		},
	]
}

/** The attributes an element writes from its own path (a node's `pathName`) that disagree with it. */
function collectOwnPathViolations(element: TreeEntry): ReferenceViolation[] {
	const derived = derivedAttributesFollowing({ tagName: element.record.tagName, follows: 'self' })
	if (!derived) return []
	const ownPath = elementPathOf(element)
	return ownPath ? collectDerivedViolations({ element, derived, sourcePath: ownPath }) : []
}

/**
 * The written values of `derived` that differ from their value on `sourcePath`. A value left out
 * is not reported: a hand-made fixture may omit the optional names, the hooks write them.
 */
function collectDerivedViolations(params: {
	element: TreeEntry
	derived: DerivedAttributes
	sourcePath: ElementPath
}): ReferenceViolation[] {
	const { element, derived, sourcePath } = params
	return composeDerivedAttributes({ derived, sourcePath }).flatMap(({ name, value }) => {
		const written = writtenAttribute({ record: element.record, name })
		if (!written || written === value) return []
		return [
			{
				kind: 'derived' as const,
				elementTagName: element.record.tagName,
				attribute: name,
				written,
				expected: value,
			},
		]
	})
}

/** The path of an element of the document, read from its ancestors. */
function elementPathOf(element: TreeEntry): ElementPath | null {
	return buildPathFromAncestry({
		record: element.record,
		ancestry: element.ancestors,
		specNamings: specNamingsOf(element.ancestors),
	})
}

/**
 * A reference whose written path is the target's chain of names and nothing else: the pair
 * resolves directly, and the target is addressed by its name (not by a data or signal form).
 */
function isPlainNamePath(params: { pair: ReferencePair; target: TreeEntry }): boolean {
	const { pair, target } = params
	if (pair.resolution !== RESOLUTION_TYPE.direct) return false
	return PATH_EXTRACTION_CONFIG[target.record.tagName]?.type === 'name'
}

function isSclElement(element: TreeEntry): boolean {
	return SCL_NAMESPACE_URIS.includes(element.record.namespace.uri)
}

/** The value an element writes for an attribute, `undefined` when it writes none. */
function writtenAttribute(params: { record: AnyTreeRecord; name: string }): string | undefined {
	const { record, name } = params
	return readAttribute({ record, name, defaults: 'none', fullObject: true })?.value
}

function indexByUuid(elements: readonly TreeEntry[]): Map<string, TreeEntry[]> {
	const elementsByUuid = new Map<string, TreeEntry[]>()
	for (const element of elements) {
		const uuid = writtenAttribute({ record: element.record, name: 'uuid' })
		if (!uuid) continue
		const sameUuid = elementsByUuid.get(uuid) ?? []
		elementsByUuid.set(uuid, [...sameUuid, element])
	}
	return elementsByUuid
}

/**
 * The `LNodeSpecNaming` of each LNode among `ancestors`, by LNode id: a child of the LNode in the record tree (the
 * `Private` the file wraps it in is a transparent element, no record).
 */
function specNamingsOf(ancestors: readonly AnyTreeRecord[]): Map<string, AnyRawRecord> {
	const namings = new Map<string, AnyRawRecord>()
	for (const ancestor of ancestors) {
		if (ancestor.tagName !== 'LNode') continue
		const naming = ancestor.tree.find((child) => child.tagName === 'LNodeSpecNaming')
		if (naming) namings.set(ancestor.id, naming)
	}
	return namings
}
