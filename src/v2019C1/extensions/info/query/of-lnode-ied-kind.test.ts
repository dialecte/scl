import { of } from './of'
import { ofEach } from './of-each'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { LNodeMapping } from '../constants/state.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** An IED holding one logical node `PTRC1` (uuid `uuid-<key>`) in `LD0`, with the source files given. */
function iedWith(params: { key: string; sourceFiles?: string }): string {
	const { key, sourceFiles = '' } = params
	return /* xml */ `
		<IED name="IED_${key}" ${id}="ied-${key}">
			${sourceFiles}
			<AccessPoint name="AP1" ${id}="ap-${key}">
				<Server ${id}="srv-${key}">
					<Authentication ${id}="auth-${key}"/>
					<LDevice inst="LD0" ${id}="ld0-${key}">
						<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0-${key}"/>
						<LN lnClass="PTRC" inst="1" lnType="T1" uuid="uuid-${key}" ${id}="ln-${key}"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	`
}

function sourceFiles(key: string, fileType: string): string {
	return `<IEDSourceFiles ${id}="isf-${key}"><SclFileReference fileType="${fileType}" ${id}="sfr-${key}"/></IEDSourceFiles>`
}

/** An LNode bound by `lnUuid` to the logical node of the IED of that key. */
function lnodeTo(key: string): string {
	return `<LNode lnClass="PTRC" lnInst="1" iedName="IED_${key}" ldInst="LD0" lnUuid="uuid-${key}" ${id}="lnode-${key}"/>`
}

const KEYS = ['icd', 'iid', 'scd', 'bare'] as const

/** One LNode per IED, the IEDs of every kind: ICD and IID source files (real), SCD only and none (specification). */
const EVERY_KIND_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<Function name="F1" ${id}="f1">
				${KEYS.map(lnodeTo).join('')}
			</Function>
		</Substation>
		${iedWith({ key: 'icd', sourceFiles: sourceFiles('icd', 'ICD') })}
		${iedWith({ key: 'iid', sourceFiles: sourceFiles('iid', 'IID') })}
		${iedWith({ key: 'scd', sourceFiles: sourceFiles('scd', 'SCD') })}
		${iedWith({ key: 'bare' })}
	</SCL>
`

function lnodeRef(key: (typeof KEYS)[number]): Scl.Ref<'LNode'> {
	return { tagName: 'LNode', id: `lnode-${key}` }
}

/** A single `of` with the state classifies the IED its LNode maps to, by the same rule as `classifyIeds`. */
describe('of(LNode, withState) - the kind of the IED it maps to', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<'LNode'>
		expected: LNodeMapping
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LNode mapped to an IED with an ICD source file → real IED': {
			sourceXml: EVERY_KIND_XML,
			ref: lnodeRef('icd'),
			expected: 'real-ied',
		},
		'LNode mapped to an IED with an IID source file → real IED': {
			sourceXml: EVERY_KIND_XML,
			ref: lnodeRef('iid'),
			expected: 'real-ied',
		},
		'LNode mapped to an IED with an SCD source file only → specification IED': {
			sourceXml: EVERY_KIND_XML,
			ref: lnodeRef('scd'),
			expected: 'specification-ied',
		},
		'LNode mapped to an IED without IEDSourceFiles → specification IED': {
			sourceXml: EVERY_KIND_XML,
			ref: lnodeRef('bare'),
			expected: 'specification-ied',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const info = await of(source.query, testCase.ref, { withState: true })
			expect(info.state).toEqual({ locked: true, mapping: testCase.expected })
		},
	})
})

describe('of(LNode, withState) in an ICD document', () => {
	it('an LNode mapped to an IED without source files in an .icd document → real IED, by the file it is in', async () => {
		const { project } = await createSclTestProject({ sourceXml: `<SCL ${ns} ${id}="root"/>` })
		const xml = /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<Function name="F1" ${id}="f1">${lnodeTo('bare')}</Function>
				</Substation>
				${iedWith({ key: 'bare' })}
			</SCL>
		`
		const imported = await project.importFile(new File([xml], 'device.icd', { type: 'text/xml' }))
		const document = project.openDocument(imported.documentId)

		// an imported file keeps no test record id: the LNode is read by its tag
		const [lnode] = await document.query.getRecordsByTagName('LNode')
		const info = await of(document.query, lnode, { withState: true })

		expect(info.state).toEqual({ locked: true, mapping: 'real-ied' })
	})
})

describe('of and ofEach with the state - the same mapping per LNode', () => {
	type TestCase = SclTest.BaseXmlTestCase & { refs: Scl.Ref<'LNode'>[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'four LNodes mapped to IEDs of both kinds → of one by one gives what ofEach gives': {
			sourceXml: EVERY_KIND_XML,
			refs: KEYS.map(lnodeRef),
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const query = source.query
			const each = await ofEach(query, testCase.refs, { withState: true })
			const single: unknown[] = []
			for (const ref of testCase.refs) {
				const info = await of(query, ref, { withState: true })
				single.push(info.state)
			}
			expect(single).toEqual(each.map(({ state }) => state))
			expect(each.map(({ state }) => state)).toEqual([
				{ locked: true, mapping: 'real-ied' },
				{ locked: true, mapping: 'real-ied' },
				{ locked: true, mapping: 'specification-ied' },
				{ locked: true, mapping: 'specification-ied' },
			])
		},
	})
})

/** The state of one LNode reads the IED it maps to, not the whole document. */
describe('of(LNode, withState) - the store reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & { ref: Scl.Ref<'LNode'> }

	const testCases: SclTest.TestCases<TestCase> = {
		'LNode mapped to a real IED among IEDs of both kinds → no read of the whole document': {
			sourceXml: EVERY_KIND_XML,
			ref: lnodeRef('icd'),
		},
		'LNode mapped to a specification IED among IEDs of both kinds → no read of the whole document':
			{
				sourceXml: EVERY_KIND_XML,
				ref: lnodeRef('bare'),
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			const query = source.query
			source.perf.reset()
			await of(query, testCase.ref, { withState: true })
			expect(source.perf.report()['core::store::getByDocumentId']?.count ?? 0).toBe(0)
		},
	})
})

/** `ofEach` with the states classifies the IEDs once for the call, not once per LNode or per IED. */
describe('ofEach(LNodes, withState) - the IEDs classified once', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<'LNode'>[]
		expected: { iedsReadByTag: number; iedSourceFilesReadAlone: number }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'four LNodes mapped to four IEDs of both kinds → the IEDs read by tag once, no IED read alone':
			{
				sourceXml: EVERY_KIND_XML,
				refs: KEYS.map(lnodeRef),
				expected: { iedsReadByTag: 1, iedSourceFilesReadAlone: 0 },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const { query, calls } = countQueryReads(source.query)
			await ofEach(query, testCase.refs, { withState: true })
			expect({
				iedsReadByTag: calls.filter(
					({ method, args }) => method === 'getRecordsByTagName' && args[0] === 'IED',
				).length,
				iedSourceFilesReadAlone: calls.filter(
					({ method, args }) => method === 'getChildren' && args[1] === 'IEDSourceFiles',
				).length,
			}).toEqual(testCase.expected)
		},
	})
})

/** A source file list wrapped in a `Private` is not its IED's own: `of` and `ofEach` agree that the IED specifies. */
describe('of and ofEach with the state - a source file list wrapped in a Private', () => {
	type TestCase = SclTest.BaseXmlTestCase & { ref: Scl.Ref<'LNode'>; expected: LNodeMapping }

	const testCases: SclTest.TestCases<TestCase> = {
		'LNode mapped to an IED whose ICD source file list is wrapped in a Private → specification IED, of as ofEach':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">${lnodeTo('wrapped')}</Function>
						</Substation>
						${iedWith({
							key: 'wrapped',
							sourceFiles: `<Private type="vendor" ${id}="private">${sourceFiles('wrapped', 'ICD')}</Private>`,
						})}
					</SCL>
				`,
				ref: { tagName: 'LNode', id: 'lnode-wrapped' },
				expected: 'specification-ied',
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const query = source.query
			const single = await of(query, testCase.ref, { withState: true })
			const [each] = await ofEach(query, [testCase.ref], { withState: true })
			expect({ of: single.state, ofEach: each?.state }).toEqual({
				of: { locked: true, mapping: testCase.expected },
				ofEach: { locked: true, mapping: testCase.expected },
			})
		},
	})
})
