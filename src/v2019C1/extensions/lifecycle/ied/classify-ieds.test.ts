import { classifyIed, classifyIeds, readIedKinds } from './classify-ieds'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { IedClassification, IedKind } from './classify-ieds.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

function sourceFiles(key: string, ...fileTypes: string[]): string {
	const references = fileTypes
		.map(
			(fileType, index) => `<SclFileReference fileType="${fileType}" ${id}="sfr-${key}-${index}"/>`,
		)
		.join('')
	return `<IEDSourceFiles ${id}="isf-${key}">${references}</IEDSourceFiles>`
}

function scl(body: string, header = ''): string {
	return /* xml */ `<SCL ${ns} ${id}="root">${header}${body}</SCL>`
}

describe('classifyIeds', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expected: (Pick<IedClassification, 'name' | 'kind' | 'basis'> & { iedId: string })[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an ICD reference among its source files → implemented': {
			sourceXml: scl(
				`<IED name="P1" manufacturer="ABB" ${id}="ied-1">${sourceFiles('1', 'ICD')}</IED>`,
			),
			expected: [{ iedId: 'ied-1', name: 'P1', kind: 'implemented', basis: 'provenance' }],
		},
		'an IID reference among its source files → implemented': {
			sourceXml: scl(`<IED name="P1" ${id}="ied-1">${sourceFiles('1', 'IID')}</IED>`),
			expected: [{ iedId: 'ied-1', name: 'P1', kind: 'implemented', basis: 'provenance' }],
		},
		'an ISD then an ICD reference → implemented': {
			sourceXml: scl(`<IED name="P1" ${id}="ied-1">${sourceFiles('1', 'ISD', 'ICD')}</IED>`),
			expected: [{ iedId: 'ied-1', name: 'P1', kind: 'implemented', basis: 'provenance' }],
		},
		'only an ISD and an SSD reference → specification': {
			sourceXml: scl(`<IED name="S1" ${id}="ied-1">${sourceFiles('1', 'ISD', 'SSD')}</IED>`),
			expected: [{ iedId: 'ied-1', name: 'S1', kind: 'specification', basis: 'no-provenance' }],
		},
		'no source files, whatever its manufacturer → specification': {
			sourceXml: scl(
				`<IED name="S1" manufacturer="S_IED" ${id}="ied-1"/><IED name="V1" manufacturer="ABB" ${id}="ied-2"/>`,
			),
			expected: [
				{ iedId: 'ied-1', name: 'S1', kind: 'specification', basis: 'no-provenance' },
				{ iedId: 'ied-2', name: 'V1', kind: 'specification', basis: 'no-provenance' },
			],
		},
		'an ICD reference in the header only → specification, only the IED own source files count': {
			sourceXml: scl(
				`<IED name="S1" ${id}="ied-1"/>`,
				`<Header id="H1" ${id}="header"><SourceFiles ${id}="sf"><SclFileReference fileType="ICD" ${id}="sfr-h"/></SourceFiles></Header>`,
			),
			expected: [{ iedId: 'ied-1', name: 'S1', kind: 'specification', basis: 'no-provenance' }],
		},
		'two IEDs of each kind → both classified, in document order': {
			sourceXml: scl(
				`<IED name="Spec" ${id}="ied-spec"/><IED name="Real" ${id}="ied-real">${sourceFiles('r', 'ICD')}</IED>`,
			),
			expected: [
				{ iedId: 'ied-spec', name: 'Spec', kind: 'specification', basis: 'no-provenance' },
				{ iedId: 'ied-real', name: 'Real', kind: 'implemented', basis: 'provenance' },
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const classifications = await classifyIeds(source.query)
			expect(
				classifications.map(({ ied, name, kind, basis }) => ({ iedId: ied.id, name, kind, basis })),
			).toEqual(testCase.expected)
		},
	})
})

describe('classifyIeds in an ICD file', () => {
	it('an IED without source files in an .icd document → implemented, by the file it is in', async () => {
		const { project } = await createSclTestProject({ sourceXml: scl('') })
		const xml = scl(`<IED name="Device" manufacturer="ABB" ${id}="ied-1"/>`)
		const imported = await project.importFile(new File([xml], 'device.icd', { type: 'text/xml' }))
		const document = project.openDocument(imported.documentId)

		const classifications = await classifyIeds(document.query)

		expect(classifications.map(({ name, kind, basis }) => ({ name, kind, basis }))).toEqual([
			{ name: 'Device', kind: 'implemented', basis: 'icd-file' },
		])
	})
})

/**
 * IEDs of every kind in one document: real by an ICD or an IID reference among their own source files (directly under
 * the IED), specification with other references only, with none, or with an ICD reference in the header only.
 */
const EVERY_KIND_XML = scl(
	[
		`<IED name="Icd" ${id}="ied-icd">${sourceFiles('icd', 'ICD')}</IED>`,
		`<IED name="Spec" ${id}="ied-spec">${sourceFiles('spec', 'ISD', 'SSD')}</IED>`,
		`<IED name="Iid" ${id}="ied-iid">${sourceFiles('iid', 'ISD', 'IID')}</IED>`,
		`<IED name="Bare" ${id}="ied-bare"/>`,
	].join(''),
	`<Header id="H1" ${id}="header"><SourceFiles ${id}="sf"><SclFileReference fileType="ICD" ${id}="sfr-h"/></SourceFiles></Header>`,
)

const EVERY_KIND = [
	{ iedId: 'ied-icd', name: 'Icd', kind: 'implemented' },
	{ iedId: 'ied-spec', name: 'Spec', kind: 'specification' },
	{ iedId: 'ied-iid', name: 'Iid', kind: 'implemented' },
	{ iedId: 'ied-bare', name: 'Bare', kind: 'specification' },
] as const

function byIedId(entry: { iedId: string }, other: { iedId: string }): number {
	return entry.iedId.localeCompare(other.iedId)
}

function byName(entry: { name: string }, other: { name: string }): number {
	return entry.name.localeCompare(other.name)
}

/** The kinds of every IED, read by tag in no particular order, by the rule of `classifyIeds`. */
describe('readIedKinds', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expected: readonly { iedId: string; name: string; kind: IedKind }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'IEDs of every kind → each IED with its name and the kind classifyIeds gives': {
			sourceXml: EVERY_KIND_XML,
			expected: EVERY_KIND,
		},
		'no IED → nothing': {
			sourceXml: scl(`<Header id="H1" ${id}="header"/>`),
			expected: [],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			// the call under test settles inside the assertion first: a throw is its failure, not the act's
			await expect(readIedKinds(source.query)).resolves.toHaveLength(testCase.expected.length)
			const kinds = await readIedKinds(source.query)
			const classifications = await classifyIeds(source.query)
			const read = kinds.map(({ ied, name, kind }) => ({ iedId: ied.id, name, kind })).sort(byIedId)
			expect(read).toEqual([...testCase.expected].sort(byIedId))
			expect(read).toEqual(
				classifications.map(({ ied, name, kind }) => ({ iedId: ied.id, name, kind })).sort(byIedId),
			)
		},
	})
})

describe('readIedKinds in an ICD file', () => {
	it('IEDs without source files in an .icd document → each implemented, by the file it is in', async () => {
		const { project } = await createSclTestProject({ sourceXml: scl('') })
		const xml = scl(`<IED name="A" ${id}="ied-a"/><IED name="B" ${id}="ied-b"/>`)
		const imported = await project.importFile(new File([xml], 'device.icd', { type: 'text/xml' }))
		const document = project.openDocument(imported.documentId)

		await expect(readIedKinds(document.query)).resolves.toHaveLength(2)
		const kinds = await readIedKinds(document.query)

		expect(kinds.map(({ name, kind }) => ({ name, kind })).sort(byName)).toEqual([
			{ name: 'A', kind: 'implemented' },
			{ name: 'B', kind: 'implemented' },
		])
	})
})

/** The kind of one IED, by the rule of `classifyIeds`, read from that IED alone. */
describe('classifyIed', () => {
	type TestCase = SclTest.BaseXmlTestCase & { ied: Scl.Ref<'IED'>; expected: IedKind | undefined }

	const testCases: SclTest.TestCases<TestCase> = {
		...Object.fromEntries(
			EVERY_KIND.map(({ iedId, name, kind }) => [
				`IED ${name}, its source files directly under it → ${kind}, as classifyIeds gives`,
				{ sourceXml: EVERY_KIND_XML, ied: { tagName: 'IED', id: iedId }, expected: kind },
			]),
		),
		'an IED the document does not hold → undefined': {
			sourceXml: EVERY_KIND_XML,
			ied: { tagName: 'IED', id: 'ied-gone' },
			expected: undefined,
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await expect(classifyIed(source.query, { ied: testCase.ied })).resolves.toBe(
				testCase.expected,
			)
			if (testCase.expected === undefined) return
			const kind = await classifyIed(source.query, { ied: testCase.ied })
			const classifications = await classifyIeds(source.query)
			const classified = classifications.find(({ ied }) => ied.id === testCase.ied.id)
			expect(classified?.kind).toBe(kind)
		},
	})
})

/** No classification reads the whole document: the IEDs and their source files are read by tag, or one IED alone. */
describe('classifyIeds, readIedKinds and classifyIed - the store reads', () => {
	type StoreReads = { getByDocumentId: number; getByTagName?: number; getMany?: number }
	type TestCase = SclTest.BaseXmlTestCase & {
		classify: (query: Scl.Query) => Promise<unknown>
		expected: StoreReads
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'classifyIeds over IEDs of every kind → no read of the whole document': {
			sourceXml: EVERY_KIND_XML,
			classify: async (query) => await classifyIeds(query),
			expected: { getByDocumentId: 0 },
		},
		'readIedKinds over IEDs of every kind → two reads by tag, one batch of source file lists, nothing for order':
			{
				sourceXml: EVERY_KIND_XML,
				classify: async (query) => await readIedKinds(query),
				expected: { getByDocumentId: 0, getByTagName: 2, getMany: 1 },
			},
		'classifyIed of a real IED among IEDs of every kind → no read of the whole document': {
			sourceXml: EVERY_KIND_XML,
			classify: async (query) =>
				await classifyIed(query, { ied: { tagName: 'IED', id: 'ied-iid' } }),
			expected: { getByDocumentId: 0 },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const query = source.query
			source.perf.reset()
			await expect(testCase.classify(query)).resolves.toBeDefined()
			const report = source.perf.report()
			const reads: StoreReads = {
				getByDocumentId: report['core::store::getByDocumentId']?.count ?? 0,
			}
			if (testCase.expected.getByTagName !== undefined)
				reads.getByTagName = report['core::store::getByTagName']?.count ?? 0
			if (testCase.expected.getMany !== undefined)
				reads.getMany = report['core::store::getMany']?.count ?? 0
			expect(reads).toEqual(testCase.expected)
		},
	})
})

/** Only the source file lists directly under an IED are its own: a list wrapped in a `Private` is not read. */
describe('classifyIeds - the IED own source files only', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expected: (Pick<IedClassification, 'name' | 'kind' | 'basis'> & { iedId: string })[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an ICD reference in source files wrapped in a Private → specification, only the source files directly under the IED count':
			{
				sourceXml: scl(
					`<IED name="S1" ${id}="ied-1"><Private type="vendor" ${id}="private">${sourceFiles('1', 'ICD')}</Private></IED>`,
				),
				expected: [{ iedId: 'ied-1', name: 'S1', kind: 'specification', basis: 'no-provenance' }],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const classifications = await classifyIeds(source.query)
			expect(
				classifications.map(({ ied, name, kind, basis }) => ({ iedId: ied.id, name, kind, basis })),
			).toEqual(testCase.expected)
		},
	})
})

/**
 * A source file list wrapped in a `Private` is not the IED's own, for one IED as for all: the single read and the
 * read of every IED give the same kind.
 */
describe('classifyIed - a source file list wrapped in a Private, as classifyIeds', () => {
	type TestCase = SclTest.BaseXmlTestCase & { ied: Scl.Ref<'IED'>; expected: IedKind }

	const testCases: SclTest.TestCases<TestCase> = {
		'an ICD reference in source files wrapped in a Private → specification, as classifyIeds gives':
			{
				sourceXml: scl(
					`<IED name="S1" ${id}="ied-1"><Private type="vendor" ${id}="private">${sourceFiles('1', 'ICD')}</Private></IED>`,
				),
				ied: { tagName: 'IED', id: 'ied-1' },
				expected: 'specification',
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await expect(classifyIed(source.query, { ied: testCase.ied })).resolves.toBe(
				testCase.expected,
			)
			const classifications = await classifyIeds(source.query)
			expect(classifications.map(({ kind }) => kind)).toEqual([testCase.expected])
		},
	})
})

/** Only a reference directly in a list directly under the IED is the IED's own: one IED or all, the same kind. */
describe('classifyIed and classifyIeds - lists and references wrapped in a Private', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: IedKind }

	const testCases: SclTest.TestCases<TestCase> = {
		'an ISD list directly under the IED and an ICD list wrapped in a Private → specification': {
			sourceXml: scl(
				`<IED name="S1" ${id}="ied-1">${sourceFiles('direct', 'ISD')}<Private type="vendor" ${id}="private">${sourceFiles('wrapped', 'ICD')}</Private></IED>`,
			),
			expected: 'specification',
		},
		'an ICD reference wrapped in a Private inside a list directly under the IED → specification': {
			sourceXml: scl(
				`<IED name="S1" ${id}="ied-1"><IEDSourceFiles ${id}="isf"><Private type="vendor" ${id}="private"><SclFileReference fileType="ICD" ${id}="sfr"/></Private></IEDSourceFiles></IED>`,
			),
			expected: 'specification',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await expect(
				classifyIed(source.query, { ied: { tagName: 'IED', id: 'ied-1' } }),
			).resolves.toBe(testCase.expected)
			const classifications = await classifyIeds(source.query)
			expect(classifications.map(({ kind }) => kind)).toEqual([testCase.expected])
		},
	})
})

describe('classifyIed in an ICD file', () => {
	it('an IED without source files in an .icd document → implemented, by the file it is in', async () => {
		const { project } = await createSclTestProject({ sourceXml: scl('') })
		const xml = scl(`<IED name="Device" ${id}="ied-1"/>`)
		const imported = await project.importFile(new File([xml], 'device.icd', { type: 'text/xml' }))
		const document = project.openDocument(imported.documentId)
		// an imported file keeps no test record id: the IED is read by its tag
		const [ied] = await document.query.getRecordsByTagName('IED')

		await expect(
			classifyIed(document.query, { ied: { tagName: 'IED', id: ied.id } }),
		).resolves.toBe('implemented')
	})
})
