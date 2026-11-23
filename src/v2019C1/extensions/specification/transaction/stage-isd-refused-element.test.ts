import projectWithTemplate from './fixtures/stage-isd/project-with-template.xml?raw'
import project from './fixtures/stage-isd/project.xml?raw'
import shell from './fixtures/stage-isd/shell.xml?raw'
import { stageIsd } from './stage-isd'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Contract: a refusal names the element it is about; a shell IED the shell document lacks is not found. */
describe('stageIsd - the element a refusal names', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		lnodes: string[]
		shellIed: string
		expectedRefusal: { key: string; ref?: { tagName: string; id: string } }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'the staging document holds the IED X → target-not-empty naming X': {
			// project: any LNode of the process
			sourceXml: project,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"><IED name="X" ${id}="held-ied"/></SCL>`,
			lnodes: ['ptoc1'],
			shellIed: 'shell-ied',
			expectedRefusal: {
				key: 'SPECIFICATION_STAGE_REFUSED',
				ref: { tagName: 'IED', id: 'held-ied' },
			},
			expectedQueries: ['/default:SCL[count(*)=1]/default:IED[@name="X"]'],
		},
		'an LNode in a function template → lnode-outside-process naming it': {
			// project-with-template: template-ptrc2 sits in a FunctionTemplate
			sourceXml: projectWithTemplate,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"/>`,
			lnodes: ['ptoc1', 'template-ptrc2'],
			shellIed: 'shell-ied',
			expectedRefusal: {
				key: 'SPECIFICATION_STAGE_REFUSED',
				ref: { tagName: 'LNode', id: 'template-ptrc2' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		'a shell IED the shell document does not hold → ELEMENT_NOT_FOUND': {
			// project: any LNode of the process; the shell document holds only shell-ied
			sourceXml: project,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"/>`,
			lnodes: ['ptoc1'],
			shellIed: 'absent',
			expectedRefusal: { key: 'ELEMENT_NOT_FOUND' },
			expectedQueries: ['/default:SCL[count(*)=0]'],
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
		const refused = await target
			.transaction(async function stage(tx) {
				return stageIsd(tx, {
					sourceQuery: source.query,
					lnodes: testCase.lnodes.map((lnode) => ({ tagName: 'LNode', id: lnode })),
					shell: { query: shellDocument.query, ied: { tagName: 'IED', id: testCase.shellIed } },
					iedName: 'R',
				})
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		const reported = toDialecteError(refused)
		expect({
			key: reported?.key,
			ref: (reported?.meta as { ref?: unknown } | undefined)?.ref,
		}).toEqual({
			key: testCase.expectedRefusal.key,
			ref: testCase.expectedRefusal.ref,
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
