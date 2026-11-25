import { sameClassInTargetIed } from '../build/open-value-rules'
import project from './fixtures/stage-isd/project.xml?raw'
import templateWithFunctionLds from './fixtures/stage-isd/template-with-function-lds.xml?raw'
import { stageIsd } from './stage-isd'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Contract: the LN0 and LPHD types of a template are the staged IED's own for the type rules, as its logical nodes once were. */
describe('stageIsd - the template’s LN0 and LPHD types offered as the IED’s own', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const testCases: SclTest.TestCases<TestCase> = {
		'rule sameClassInTargetIed alone, the template’s LPHD typed LPHD_S → the added LPHD typed LPHD_S, not refused':
			{
				// project: PROT’s LNodes name their types, none of class LPHD; template-with-function-lds: its LPHD typed LPHD_S
				sourceXml: project,
				allowInvalidOutput: {
					reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
					violations: [{ check: 'references', code: 'dangling' }],
				},
				targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"/>`,
				expectedQueries: [
					'//default:IED[@name="R"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="LPHD"][@lnType="LPHD_S"]',
				],
				unexpectedQueries: ['//default:IED[@uuid="20000000-0000-4000-8000-000000000003"]'],
			},
	}

	async function act({
		project: workspace,
		source,
		target,
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
				build: { openValues: { lnType: sameClassInTargetIed } },
			})
		})
		await expect(staging).resolves.toMatchObject({ ied: { tagName: 'IED' } })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
