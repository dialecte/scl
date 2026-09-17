import { writeProvenance } from './write-provenance'

import { describe } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclFileType } from './write-provenance.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	target:
		| { anchor: 'function' | 'application'; rootTag: Scl.ElementsOf; rootId: string }
		| { anchor: 'document'; fileType: SclFileType }
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
				</SCL>
			`,
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
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
				</SCL>
			`,
			target: { anchor: 'application', rootTag: 'Application', rootId: 'app-1' },
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"]//v2019C1:ApplicationSclRef/v2019C1:SclFileReference[@fileType="ASD"][@fileUuid="doc-uuid"][@version="3"][@revision="C"]',
			],
			unexpectedQueries: ['//v2019C1:FunctionSclRef'],
		},

		'SSD: appends a Header > SourceFiles > SclFileReference sourced from the Header': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${ID}="scl-1">
					<Header id="proj" uuid="ssd-uuid" version="0" revision="14" ${ID}="hdr-1"/>
					<Substation name="S1" ${ID}="sub-1"/>
				</SCL>
			`,
			target: { anchor: 'document', fileType: 'SSD' },
			expectedQueries: [
				'//default:Header/default:SourceFiles/default:SclFileReference[@fileType="SSD"][@fileUuid="ssd-uuid"][@version="0"][@revision="14"]',
			],
			unexpectedQueries: ['//v2019C1:FunctionSclRef', '//v2019C1:ApplicationSclRef'],
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
					</SCL>
				`,
				target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
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
				</SCL>
			`,
			target: { anchor: 'function', rootTag: 'Function', rootId: 'fn-1' },
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
			const t = testCase.target
			if (t.anchor === 'document') {
				await writeProvenance(tx, {
					sourceQuery: source.query,
					target: { anchor: 'document', fileType: t.fileType },
				})
				return
			}
			if (t.anchor === 'function') {
				await writeProvenance(tx, {
					sourceQuery: source.query,
					target: {
						anchor: 'function',
						root: { tagName: t.rootTag, id: t.rootId } as unknown as Scl.Ref<'Function'>,
					},
				})
				return
			}
			await writeProvenance(tx, {
				sourceQuery: source.query,
				target: {
					anchor: 'application',
					root: { tagName: t.rootTag, id: t.rootId } as unknown as Scl.Ref<'Application'>,
				},
			})
		})

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
