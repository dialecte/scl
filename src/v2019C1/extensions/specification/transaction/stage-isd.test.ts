import { firstOfClass } from '../build/open-value-rules'
import projectQ02 from './fixtures/stage-isd/project-q02.xml?raw'
import projectTypeless from './fixtures/stage-isd/project-typeless.xml?raw'
import project from './fixtures/stage-isd/project.xml?raw'
import shellClashingType from './fixtures/stage-isd/shell-clashing-type.xml?raw'
import shell from './fixtures/stage-isd/shell.xml?raw'
import { stageIsd } from './stage-isd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const STAGED_LNODES = ['ptoc1', 'ptrc1', 'lln0']
/** The logical device built from the function PROT. */
const PROT_LD = '//default:IED[@name="R"]//default:LDevice[@inst="PROT"]'

/**
 * Contract: the staging document holds the frames of the LNodes given, released to their specification, and the IED
 * built from them on a copy of the shell; the project is only read.
 */
describe('stageIsd - the staged ISD of a specification built from logical nodes', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		shellXml: string
		lnodes: string[]
		iedName: string
		iedUuid?: string
	}

	const emptyScratch = /* xml */ `<SCL ${ns} ${id}="scratch"/>`

	const testCases: SclTest.TestCases<TestCase> = {
		// project: PROT holds PTOC1 (bound to R's LD1, specified on S1 with no sLdInst, a StrVal value), PTRC1 and LLN0; CTRL holds R's CSWI1
		'PTOC1 bound to the real R, PTRC1 unbound, the LLN0 LNode, staged as R → R built on the specification types, the LD named from the function, nothing of R itself':
			{
				sourceXml: project,

				// the staging document keeps PTRC1's link to CSWI1, outside the staged LNodes: the export cuts it

				allowInvalidOutput: {
					reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				targetXml: emptyScratch,
				shellXml: shell,
				lnodes: STAGED_LNODES,
				iedName: 'R',
				expectedQueries: [
					'/default:SCL[count(default:IED)=1]/default:IED[@name="R"][count(default:IEDSourceFiles)=0]',
					`${PROT_LD}/default:LN0[@lnType="LLN0_T"]`,
					`${PROT_LD}/default:LN[@lnClass="PTOC"][@inst="1"][@lnType="PTOC_T"]`,
					`${PROT_LD}/default:LN[@lnClass="PTRC"][@inst="1"][@lnType="PTRC_T"]`,
					`${PROT_LD}/default:LN[@lnClass="LPHD"]`,
					// the value the PTOC1 LNode specifies
					`${PROT_LD}/default:LN[@lnClass="PTOC"]/default:DOI[@name="StrVal"]/default:SDI[@name="setMag"]/default:DAI[@name="f"]/default:Val[.="9"]`,
					// the shell's own logical device stays
					'//default:IED[@name="R"]//default:LDevice[@inst="LD0"]',
					// the frame keeps the project's uuids; the LNodes bound to the built IED, now specified on it
					'//default:Function[@name="PROT"][@uuid="a0000000-0000-4000-8000-000000000001"]',
					'//default:LNode[@uuid="c0000000-0000-4000-8000-000000000001"][@iedName="R"][@ldInst="PROT"][@lnClass="PTOC"]',
					'//default:LNode[@lnClass="PTRC"][@iedName="R"][@ldInst="PROT"]',
					'//default:LNode[@lnClass="LLN0"][@iedName="R"][@ldInst="PROT"]',
					'//default:LNode[@lnClass="PTOC"]//v2019C1:LNodeSpecNaming[@sIedName="R"][@sLdInst="PROT"]',
					// a link to an LNode outside the set is left as written, for the export to cut
					'//v2019C1:SourceRef[@sourceLNodeUuid="c0000000-0000-4000-8000-000000000004"]',
				],
				unexpectedQueries: [
					'//default:LDevice[@inst="LD1"]',
					'//default:LNodeType[@id="V_PTOC"]',
					'//default:Function[@name="CTRL"]',
					'//default:LNode[@lnClass="CSWI"]',
					'//default:Communication',
				],
			},
		// project: the LNodes are specified on S1; the shell holds LD0 with an LN0 and an LPHD
		"staged as S1, the specification IED name of the LNodes → the LLN0 LNode bound to the built LD, not to the shell's LD0":
			{
				sourceXml: project,

				// the staging document keeps PTRC1's link to CSWI1, outside the staged LNodes: the export cuts it

				allowInvalidOutput: {
					reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				targetXml: emptyScratch,
				shellXml: shell,
				lnodes: STAGED_LNODES,
				iedName: 'S1',
				expectedQueries: ['//default:LNode[@lnClass="LLN0"][@iedName="S1"][@ldInst="PROT"]'],
				unexpectedQueries: ['//default:LNode[@ldInst="LD0"]'],
			},
		// project: R's uuid is 20000000-0000-4000-8000-000000000001
		"the real IED's uuid given → the staged IED carries it": {
			sourceXml: project,

			// the staging document keeps PTRC1's link to CSWI1, outside the staged LNodes: the export cuts it

			allowInvalidOutput: {
				reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			targetXml: emptyScratch,
			shellXml: shell,
			lnodes: STAGED_LNODES,
			iedName: 'R',
			iedUuid: '20000000-0000-4000-8000-000000000001',
			expectedQueries: [
				'/default:SCL/default:IED[@name="R"][@uuid="20000000-0000-4000-8000-000000000001"]',
			],
		},
		// project-q02: Q02 holds a function PROT of its own
		'Q02 of the project holds a function PROT too → the LD of Q01 named Q01_PROT': {
			sourceXml: projectQ02,

			// the staging document keeps PTRC1's link to CSWI1, outside the staged LNodes: the export cuts it

			allowInvalidOutput: {
				reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			targetXml: emptyScratch,
			shellXml: shell,
			lnodes: STAGED_LNODES,
			iedName: 'R',
			expectedQueries: ['//default:IED[@name="R"]//default:LDevice[@inst="Q01_PROT"]'],
			unexpectedQueries: ['//default:LDevice[@inst="PROT"]'],
		},
		// project-typeless: PTRC1 names no lnType; the project holds PTRC_T
		"PTRC1 without a type, rule firstOfClass → the project's PTRC_T imported and used": {
			sourceXml: projectTypeless,

			// the staging document keeps PTRC1's link to CSWI1, outside the staged LNodes: the export cuts it

			allowInvalidOutput: {
				reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			targetXml: emptyScratch,
			shellXml: shell,
			lnodes: STAGED_LNODES,
			iedName: 'R',
			expectedQueries: [
				`${PROT_LD}/default:LN[@lnClass="PTRC"][@lnType="PTRC_T"]`,
				'//default:DataTypeTemplates/default:LNodeType[@id="PTRC_T"][@lnClass="PTRC"]',
			],
		},
		// shell-clashing-type: the shell's PTOC_T holds only Beh; the specification's has Op
		"the shell holds a PTOC_T of its own → PTOC1 built on the specification's type, whatever its id":
			{
				sourceXml: project,

				// the staging document keeps PTRC1's link to CSWI1, outside the staged LNodes: the export cuts it

				allowInvalidOutput: {
					reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				targetXml: emptyScratch,
				shellXml: shellClashingType,
				lnodes: STAGED_LNODES,
				iedName: 'R',
				expectedQueries: [
					`${PROT_LD}/default:LN[@lnClass="PTOC"][@lnType=//default:LNodeType[default:DO/@name="Op"][@lnClass="PTOC"]/@id]`,
				],
			},
	}

	async function act({
		project: workspace,
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await workspace.importFile(
			new File([testCase.shellXml], 'shell.scd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const shellDocument = workspace.openDocument(imported.documentId)
		await target.transaction(async function stage(tx) {
			return stageIsd(tx, {
				sourceQuery: source.query,
				lnodes: testCase.lnodes.map((lnode) => ({ tagName: 'LNode', id: lnode })),
				shell: { query: shellDocument.query, ied: { tagName: 'IED', id: 'shell-ied' } },
				iedName: testCase.iedName,
				iedUuid: testCase.iedUuid,
				build: { openValues: { lnType: firstOfClass } },
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
