import { classifyIeds } from './classify-ieds'

import { describe, expect, it } from 'vitest'

import { createSclProject } from '@/v2019C1/dialecte'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { IedClassification } from './classify-ieds.types'
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
		const project = await createSclProject().open(`classify-ieds-${crypto.randomUUID()}`)
		try {
			const xml = scl(`<IED name="Device" manufacturer="ABB" ${id}="ied-1"/>`)
			const [imported] = await project.import([new File([xml], 'device.icd', { type: 'text/xml' })])
			const document = project.openDocument(imported.documentId)

			const classifications = await classifyIeds(document.query)

			expect(classifications.map(({ name, kind, basis }) => ({ name, kind, basis }))).toEqual([
				{ name: 'Device', kind: 'implemented', basis: 'icd-file' },
			])
		} finally {
			await project.destroy()
		}
	})
})
