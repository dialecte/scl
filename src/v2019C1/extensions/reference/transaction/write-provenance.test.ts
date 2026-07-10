import { writeProvenance } from './write-provenance'

import { describe } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { ProvenanceFileType } from './write-provenance.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	rootTag: Scl.ElementsOf
	rootId: string
	fileType: ProvenanceFileType
}

describe('writeProvenance', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE
	const ns = ALL_XMLNS_NAMESPACES

	const testCases: SclTest.TestCases<TestCase> = {
		'FSD: writes a FunctionSclRef -> SclFileReference sourced from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="h" uuid="doc-uuid" version="2" revision="B" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1">
						<VoltageLevel name="V1" ${ID}="vl-1">
							<Bay name="B1" ${ID}="bay-1">
								<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			rootTag: 'Function',
			rootId: 'fn-1',
			fileType: 'FSD',
			expectedQueries: [
				'//default:Function[@name="Prot"]//v2019C1:FunctionSclRef/v2019C1:SclFileReference[@fileType="FSD"][@fileUuid="doc-uuid"][@version="2"][@revision="B"]',
			],
			unexpectedQueries: ['//v2019C1:ApplicationSclRef'],
		},

		'ASD: writes an ApplicationSclRef -> SclFileReference sourced from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="h" uuid="doc-uuid" version="3" revision="C" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1">
						<Private type="eIEC61850-6-100" ${ID}="priv-1">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-uuid" ${ID}="app-1"/>
						</Private>
					</Substation>
				</SCL>`,
			rootTag: 'Application',
			rootId: 'app-1',
			fileType: 'ASD',
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]//v2019C1:ApplicationSclRef/v2019C1:SclFileReference[@fileType="ASD"][@fileUuid="doc-uuid"][@version="3"][@revision="C"]',
			],
			unexpectedQueries: ['//v2019C1:FunctionSclRef'],
		},

		'no Header: required version/revision fall back to empty strings, optional fileUuid is omitted':
			{
				sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<VoltageLevel name="V1" ${ID}="vl-1">
							<Bay name="B1" ${ID}="bay-1">
								<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>`,
				rootTag: 'Function',
				rootId: 'fn-1',
				fileType: 'FSD',
				expectedQueries: [
					'//default:Function[@name="Prot"]//v2019C1:FunctionSclRef/v2019C1:SclFileReference[@fileType="FSD"][@version=""][@revision=""]',
				],
				unexpectedQueries: ['//v2019C1:SclFileReference[@fileUuid]'],
			},

		'coexists with a preserved composition ref (creates a distinct ref, does not overwrite)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="h" uuid="doc-uuid" version="1" revision="A" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1">
						<VoltageLevel name="V1" ${ID}="vl-1">
							<Bay name="B1" ${ID}="bay-1">
								<Function name="Prot" uuid="fn-uuid" ${ID}="fn-1">
									<Private type="eIEC61850-6-100" ${ID}="priv-1">
										<eIEC61850-6-100:FunctionSclRef ${ID}="fnref-1">
											<eIEC61850-6-100:SclFileReference fileType="FSD" fileName="existing.fsd" version="9" revision="Z" ${ID}="fnscl-1"/>
										</eIEC61850-6-100:FunctionSclRef>
									</Private>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>`,
			rootTag: 'Function',
			rootId: 'fn-1',
			fileType: 'FSD',
			expectedQueries: [
				// the preserved composition ref is untouched
				'//default:Function[@name="Prot"]//v2019C1:SclFileReference[@fileName="existing.fsd"][@version="9"][@revision="Z"]',
				// the new instantiation ref is added alongside it
				'//default:Function[@name="Prot"]//v2019C1:SclFileReference[@fileUuid="doc-uuid"][@version="1"][@revision="A"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await writeProvenance(tx, {
				sourceQuery: source.query,
				targetRoot: {
					tagName: testCase.rootTag,
					id: testCase.rootId,
				} as unknown as Scl.Ref<Scl.ElementsOf>,
				fileType: testCase.fileType,
			})
		})

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
