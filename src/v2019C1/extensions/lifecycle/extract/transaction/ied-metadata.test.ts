/// <reference types="vite/client" />

import SelectedIedImplementedFromAnIidXml from './fixtures/selected-ied-implemented-from-an-iid.xml?raw'
import SelectedIedSpecifiedByTheSourceScdBesideAnUnrelatedIedXml from './fixtures/selected-ied-specified-by-the-source-scd-beside-an-unrelated-ied.xml?raw'
import SelectedIedWithoutProvenanceXml from './fixtures/selected-ied-without-provenance.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }
type RefusalCase = TestCase & {
	as?: 'revision'
	expectedRefusal: { key: string; meta?: Record<string, unknown> }
}

const emptyTarget = /* xml */ `<SCL ${ns} ${id}="empty-target"/>`

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'selected-ied' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'none',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'test',
} as const

describe('extract IED metadata', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'Known SCD specification -> new ISD header, issuer and both provenance anchors': {
			sourceXml: SelectedIedSpecifiedByTheSourceScdBesideAnUnrelatedIedXml,
			targetXml: emptyTarget,
			expectedQueries: [
				'/default:SCL[count(default:Header)=1]/default:Header[@fileType="ISD"][string-length(@id)>0][@version="0"][@revision="1"][@toolID="TEST"][@uuid!="10000000-0000-4000-8000-000000000001"]/default:History[count(default:Hitem)=1]/default:Hitem[@who="test"][@version="0"][@revision="1"][string-length(@when)>0]',
				'/default:SCL[count(default:IED)=1]/default:IED[@name="Selected"][@uuid="20000000-0000-4000-8000-000000000001"][@manufacturer="TEST_ISSUER"]',
				// the source file, at the document and at the IED
				'/default:SCL/default:Header/default:SourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SCD"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
				'//default:IED[@name="Selected"]/default:IEDSourceFiles[count(default:SclFileReference)=2]/default:SclFileReference[@fileType="SCD"][@fileUuid="10000000-0000-4000-8000-000000000001"]',
				// the older file the IED came from, kept
				'//default:IED[@name="Selected"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ISD"][@fileName="older"][@fileUuid="10000000-0000-4000-8000-000000000002"][@version="1"][@revision="A"]',
			],
			unexpectedQueries: ['//default:MinRequestedSCDFiles', '//default:IED[@name="Unrelated"]'],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const result = await target.transaction(async function extract(tx) {
			return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
		})
		expect(result).toEqual({ warnings: [] })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extract IED refusals', () => {
	const testCases: SclTest.TestCases<RefusalCase> = {
		'Selected implemented IED -> structured refusal without changes': {
			sourceXml: SelectedIedImplementedFromAnIidXml,
			targetXml: emptyTarget,
			expectedRefusal: { key: 'IED_NOT_SPECIFICATION' },
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
		'Target already contains an IED -> structured refusal without changes': {
			sourceXml: SelectedIedWithoutProvenanceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="target-root">
					<IED name="Existing" uuid="20000000-0000-4000-8000-000000000003">
						<AccessPoint name="ExistingAP"/>
					</IED>
				</SCL>
			`,
			expectedRefusal: { key: 'EXTRACTION_TARGET_NOT_EMPTY' },
			expectedQueries: [
				'/default:SCL[count(*)=1][count(default:IED)=1]/default:IED[@name="Existing"][@uuid="20000000-0000-4000-8000-000000000003"][count(*)=1]/default:AccessPoint[@name="ExistingAP"]',
			],
			unexpectedQueries: ['//default:IED[@name="Selected"]'],
		},
		'Requested revision start -> OPTION_NOT_AVAILABLE without changes': {
			sourceXml: SelectedIedWithoutProvenanceXml,
			targetXml: emptyTarget,
			as: 'revision',
			expectedRefusal: { key: 'OPTION_NOT_AVAILABLE', meta: { option: 'as', value: 'revision' } },
			expectedQueries: ['/default:SCL[count(*)=0]'],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<RefusalCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const outcome = await target.transaction(async function exportIsd(tx) {
			const stagedBefore = [...tx.getStagedOperations()]
			const refused = await tx.lifecycle.extract
				.ied({
					...EXPORT,
					sourceQuery: source.query,
					...(testCase.as ? { as: testCase.as } : {}),
				})
				.then(
					() => undefined,
					(error: unknown) => error,
				)
			return { refused, stagedBefore, stagedAfter: [...tx.getStagedOperations()] }
		})
		const reported = toDialecteError(outcome.refused)
		expect({ key: reported?.key, meta: reported?.meta }).toMatchObject(testCase.expectedRefusal)
		expect(outcome.stagedAfter).toEqual(outcome.stagedBefore)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
