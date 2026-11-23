import { firstOfClass } from '../build/open-value-rules'
import project from './fixtures/stage-isd/project.xml?raw'
import shell from './fixtures/stage-isd/shell.xml?raw'
import { stageIsd } from './stage-isd'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const R_UUID = '20000000-0000-4000-8000-000000000001'

/**
 * Contract, the two-step recipe: the logical nodes staged in an empty document with the IED built from them, then that
 * IED extracted into the ISD with the project as its source.
 */
describe('stageIsd then extract.ied - the ISD of logical nodes no specification IED holds', () => {
	type TestCase = SclTest.BaseXmlTestCase & { targetXml: string; kind: 'instance' | 'template' }

	const testCases: SclTest.TestCases<TestCase> = {
		// project: PTRC1's input names CTRL's CSWI1, outside the staged LNodes
		"an instance → IED R with R's uuid, the project's process uuids, the project recorded, the link outside the set cut":
			{
				sourceXml: project,
				targetXml: /* xml */ `<SCL ${ns} ${id}="isd"/>`,
				kind: 'instance',
				expectedQueries: [
					`/default:SCL/default:IED[@name="R"][@uuid="${R_UUID}"]`,
					'//default:Function[@name="PROT"][@uuid="a0000000-0000-4000-8000-000000000001"]',
					'/default:SCL/default:Header/default:SourceFiles/default:SclFileReference[@fileUuid="10000000-0000-4000-8000-000000000001"]',
					'//default:IED[@name="R"]/default:IEDSourceFiles/default:SclFileReference[@fileUuid="10000000-0000-4000-8000-000000000001"]',
					'//default:LNode[@lnClass="PTRC"]//v2019C1:SourceRef[@input="Blk"][not(@sourceLNodeUuid)]',
				],
				unexpectedQueries: [
					'//default:LN[@uuid="b0000000-0000-4000-8000-000000000001"]',
					'//default:Function[@name="CTRL"]',
				],
			},
		// project: the staged LNodes of PROT
		'a template → IED SPECIFICATION, no source recorded, new uuids': {
			sourceXml: project,
			targetXml: /* xml */ `<SCL ${ns} ${id}="isd"/>`,
			kind: 'template',
			expectedQueries: ['/default:SCL[count(default:IED)=1]/default:IED[@name="SPECIFICATION"]'],
			unexpectedQueries: [
				'//default:SclFileReference',
				`//default:IED[@uuid="${R_UUID}"]`,
				'//default:Function[@uuid="a0000000-0000-4000-8000-000000000001"]',
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
			new File([shell], 'shell.scd', { type: 'text/xml' }),
			{ useCustomRecordsIds: true },
		)
		const shellDocument = workspace.openDocument(imported.documentId)
		const { configKey } = await source.query.getDocumentInfo()
		const scratchId = await workspace.initEmptyDocument({
			configKey,
			name: 'stage',
			extension: '.scd',
		})
		const scratch = workspace.openDocument(scratchId)
		const staging = scratch.transaction(async function stage(tx) {
			return stageIsd(tx, {
				sourceQuery: source.query,
				lnodes: ['ptoc1', 'ptrc1', 'lln0'].map((lnode) => ({ tagName: 'LNode', id: lnode })),
				shell: { query: shellDocument.query, ied: { tagName: 'IED', id: 'shell-ied' } },
				iedName: 'R',
				iedUuid: R_UUID,
				build: { openValues: { lnType: firstOfClass } },
			})
		})
		// PTOC1 alone was bound to a real IED
		await expect(staging).resolves.toMatchObject({ released: [{ tagName: 'LNode' }] })
		const staged = await staging
		await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({
				sourceQuery: scratch.query,
				provenanceQuery: source.query,
				iedRef: staged.ied,
				fileType: 'ISD',
				kind: testCase.kind,
				inputs: 'none',
				issuer: 'ISSUER',
				tool: 'TEST',
				who: 'test',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
