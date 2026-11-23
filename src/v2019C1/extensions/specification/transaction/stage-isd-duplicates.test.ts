import { firstOfClass } from '../build/open-value-rules'
import project from './fixtures/stage-isd/project.xml?raw'
import shell from './fixtures/stage-isd/shell.xml?raw'
import { stageIsd } from './stage-isd'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Contract: an LNode given twice is staged, built and listed once. */
describe('stageIsd - an LNode given twice', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; lnodes: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		'PTOC1 given twice → built once, released once': {
			// project: PTOC1 is the one staged LNode bound to a real IED (R)
			sourceXml: project,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"/>`,
			lnodes: ['ptoc1', 'ptoc1', 'ptrc1', 'lln0'],
			allowInvalidOutput: {
				reason: 'PTRC1 links CSWI1, left out of the staging document until the export cuts it',
				violations: [{ check: 'references', code: 'dangling' }],
			},
			expectedQueries: ['//default:LDevice[@inst="PROT"][count(default:LN[@lnClass="PTOC"])=1]'],
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
			new File([shell], 'shell.scd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const shellDocument = workspace.openDocument(imported.documentId)
		const staging = target.transaction(async function stage(tx) {
			return stageIsd(tx, {
				sourceQuery: source.query,
				lnodes: testCase.lnodes.map((lnode) => ({ tagName: 'LNode', id: lnode })),
				shell: { query: shellDocument.query, ied: { tagName: 'IED', id: 'shell-ied' } },
				iedName: 'R',
				build: { openValues: { lnType: firstOfClass } },
			})
		})
		await expect(staging).resolves.toMatchObject({ released: [{ tagName: 'LNode' }] })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
