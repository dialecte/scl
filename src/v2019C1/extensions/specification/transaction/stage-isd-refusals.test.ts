import { firstOfClass } from '../build/open-value-rules'
import projectLongFunction from './fixtures/stage-isd/project-long-function.xml?raw'
import projectWithTemplate from './fixtures/stage-isd/project-with-template.xml?raw'
import project from './fixtures/stage-isd/project.xml?raw'
import shellReal from './fixtures/stage-isd/shell-real.xml?raw'
import shell from './fixtures/stage-isd/shell.xml?raw'
import { stageIsd } from './stage-isd'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyScratch = /* xml */ `<SCL ${ns} ${id}="scratch"/>`

/** Contract: what cannot be staged is refused before anything is written in the staging document. */
describe('stageIsd - refusals', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		shellXml: string
		lnodes: string[]
		iedName: string
		expectedRefusal: { key: string; meta: Record<string, unknown> }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// project: any LNode of the process
		'a staging document already holding an IED → target-not-empty': {
			sourceXml: project,
			targetXml: /* xml */ `<SCL ${ns} ${id}="scratch"><IED name="X"/></SCL>`,
			shellXml: shell,
			lnodes: ['ptoc1'],
			iedName: 'R',
			expectedRefusal: {
				key: 'SPECIFICATION_STAGE_REFUSED',
				meta: { reason: 'target-not-empty', stage: 'stageIsd' },
			},
			expectedQueries: ['/default:SCL[count(*)=1]/default:IED[@name="X"]'],
		},
		// shell-real: an ICD among the shell IED's own source files
		'a shell with an ICD among its source files → shell-not-specification': {
			sourceXml: project,
			targetXml: emptyScratch,
			shellXml: shellReal,
			lnodes: ['ptoc1'],
			iedName: 'R',
			expectedRefusal: {
				key: 'SPECIFICATION_STAGE_REFUSED',
				meta: { reason: 'shell-not-specification', stage: 'stageIsd' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		// project: any; no LNode is given
		'no LNode given → no-lnodes': {
			sourceXml: project,
			targetXml: emptyScratch,
			shellXml: shell,
			lnodes: [],
			iedName: 'R',
			expectedRefusal: {
				key: 'SPECIFICATION_STAGE_REFUSED',
				meta: { reason: 'no-lnodes', stage: 'stageIsd' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		// project-with-template: template-ptrc2 sits in a FunctionTemplate
		'an LNode in a function template → lnode-outside-process': {
			sourceXml: projectWithTemplate,
			targetXml: emptyScratch,
			shellXml: shell,
			lnodes: ['ptoc1', 'template-ptrc2'],
			iedName: 'R',
			expectedRefusal: {
				key: 'SPECIFICATION_STAGE_REFUSED',
				meta: { reason: 'lnode-outside-process', stage: 'stageIsd' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		// project: any LNode of the process
		'an IED name with a space → ied-name': {
			sourceXml: project,
			targetXml: emptyScratch,
			shellXml: shell,
			lnodes: ['ptoc1'],
			iedName: 'R 1',
			expectedRefusal: {
				key: 'SPECIFICATION_STAGE_REFUSED',
				meta: { reason: 'ied-name', stage: 'stageIsd' },
			},
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		// project-long-function: PTOC1's function is named with 52 characters
		'a function of 52 characters, staged as R → the build refuses ld-name, measured against SPECIFICATION':
			{
				sourceXml: projectLongFunction,
				targetXml: emptyScratch,
				shellXml: shell,
				lnodes: ['ptoc1'],
				iedName: 'R',
				expectedRefusal: { key: 'SPECIFICATION_BUILD_REFUSED', meta: { reason: 'ld-name' } },
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
			new File([testCase.shellXml], 'shell.scd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const shellDocument = workspace.openDocument(imported.documentId)
		const refused = await target
			.transaction(async function stage(tx) {
				return stageIsd(tx, {
					sourceQuery: source.query,
					lnodes: testCase.lnodes.map((lnode) => ({ tagName: 'LNode', id: lnode })),
					shell: { query: shellDocument.query, ied: { tagName: 'IED', id: 'shell-ied' } },
					iedName: testCase.iedName,
					build: { openValues: { lnType: firstOfClass } },
				})
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		const reported = toDialecteError(refused)
		expect({ key: reported?.key, meta: reported?.meta }).toMatchObject(testCase.expectedRefusal)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
