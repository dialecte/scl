import { firstOfClass } from '../build/open-value-rules'
import project from './fixtures/stage-isd/project.xml?raw'
import templateWithFunctionLds from './fixtures/stage-isd/template-with-function-lds.xml?raw'
import { stageIsd } from './stage-isd'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const R_IED = '/default:SCL/default:IED[@name="R"]'

/**
 * Contract: an IED staged on a template ISD takes its shell only (services, access points, server), every logical device
 * built from the LNodes; what the template held below its servers is left out and listed.
 */
describe('stageIsd - a template ISD gives its shell only', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; shellLeftOut: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'a template with LD0, a GOOSE supervision LD and a recorder function LD → R holds the LD built from PROT only, the three listed':
			{
				// project: PROT holds PTOC1, PTRC1 and the LLN0 LNode; PTRC1 links CSWI1, left out until the export cuts it
				sourceXml: project,
				allowInvalidOutput: {
					reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"/>`,
				shellLeftOut: ['ld-ld0', 'ld-goose-monitor', 'ld-dfr-fn'],
				expectedQueries: [
					`${R_IED}[not(@desc)][@manufacturer="ACME"]/default:Services/default:GOOSE[@max="4"]`,
					`${R_IED}/default:AccessPoint[@name="AP1"]/default:Server[count(default:LDevice)=1]/default:LDevice[@inst="PROT"]`,
					`${R_IED}//default:LDevice[@inst="PROT"]/default:LN[@lnClass="LPHD"][@lnType="LPHD_S"]`,
				],
				unexpectedQueries: [
					'//default:LDevice[@inst="LD0"]',
					'//default:LDevice[@inst="GOOSE_Monitor"]',
					'//default:LDevice[@inst="DFR_Fn"]',
					'//default:LN[@lnClass="RDRE" or @lnClass="RBDR" or @lnClass="LGOS"]',
					'//default:LNodeType[@id="RDRE_S" or @id="RBDR_S" or @id="LGOS_S"]',
					'//default:GSEControl',
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
			new File([templateWithFunctionLds], 'template.isd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const template = workspace.openDocument(imported.documentId)
		const staging = target.transaction(async function stage(tx) {
			return stageIsd(tx, {
				sourceQuery: source.query,
				lnodes: ['ptoc1', 'ptrc1', 'lln0'].map((lnode) => ({ tagName: 'LNode', id: lnode })),
				shell: { query: template.query, ied: { tagName: 'IED', id: 'template-ied' } },
				iedName: 'R',
				build: { openValues: { lnType: firstOfClass } },
			})
		})
		await expect(
			staging.then((staged) => (staged.shellLeftOut ?? []).map((element) => element.id)),
		).resolves.toEqual(testCase.shellLeftOut)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
