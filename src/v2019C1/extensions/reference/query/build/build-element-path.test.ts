import { buildElementPath } from './build-element-path'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type ExpectedSegment = { tagName: string; segment: string; separator: '/' | '.' }

type TestCase = SclTest.BaseXmlTestCase & {
	ref: { tagName: string; id: string }
	expected: string | null
	expectedSegments?: ExpectedSegment[]
}

describe('buildElementPath', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<TestCase> = {
		'ConductingEquipment under Substation/VoltageLevel/Bay → slash-separated named path': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
						<ConductingEquipment type="CBR" name="CE1" ${ID}="ce-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'ConductingEquipment', id: 'ce-1' },
			expected: 'S1/V1/B1/CE1',
			expectedSegments: [
				{ tagName: 'Substation', segment: 'S1', separator: '/' },
				{ tagName: 'VoltageLevel', segment: 'V1', separator: '/' },
				{ tagName: 'Bay', segment: 'B1', separator: '/' },
				{ tagName: 'ConductingEquipment', segment: 'CE1', separator: '/' },
			],
		},

		'segment-less target (LNodeType) → null — cannot address an element with no path segment': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<DataTypeTemplates ${ID}="dtt-1">
					<LNodeType id="XCBR_Type" lnClass="XCBR" ${ID}="lnt-1"/>
				</DataTypeTemplates>
			</SCL>`,
			ref: { tagName: 'LNodeType', id: 'lnt-1' },
			expected: null,
		},

		'LN under IED/AccessPoint/Server/LDevice → AccessPoint and Server skipped in path': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="LD0" ${ID}="ld-1">
								<LN lnClass="XCBR" inst="1" prefix="" ${ID}="ln-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			ref: { tagName: 'LN', id: 'ln-1' },
			expected: 'IED1/LD0/XCBR1',
			expectedSegments: [
				{ tagName: 'IED', segment: 'IED1', separator: '/' },
				{ tagName: 'LDevice', segment: 'LD0', separator: '/' },
				{ tagName: 'LN', segment: 'XCBR1', separator: '/' },
			],
		},

		'LNode with prefix under Substation/VoltageLevel/Bay → prefix+lnClass+lnInst concatenated': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="P" ${ID}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'LNode', id: 'lnode-1' },
			expected: 'S1/V1/B1/PXCBR1',
			expectedSegments: [
				{ tagName: 'Substation', segment: 'S1', separator: '/' },
				{ tagName: 'VoltageLevel', segment: 'V1', separator: '/' },
				{ tagName: 'Bay', segment: 'B1', separator: '/' },
				{ tagName: 'LNode', segment: 'PXCBR1', separator: '/' },
			],
		},

		'SourceRef with input under LNode → dot-separated after LNode segment': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="P" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="Trip" ${ID}="sr-1"/>
								</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'SourceRef', id: 'sr-1' },
			expected: 'S1/V1/B1/PXCBR1.Trip',
			expectedSegments: [
				{ tagName: 'Substation', segment: 'S1', separator: '/' },
				{ tagName: 'VoltageLevel', segment: 'V1', separator: '/' },
				{ tagName: 'Bay', segment: 'B1', separator: '/' },
				{ tagName: 'LNode', segment: 'PXCBR1', separator: '/' },
				{ tagName: 'SourceRef', segment: 'Trip', separator: '.' },
			],
		},

		'SCL root — no extractors match → null': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1"/>
			</SCL>`,
			ref: { tagName: 'SCL', id: 'scl-1' },
			expected: null,
		},

		'DOS under LNode/Private (6-100) → LNode segment then dot-separated DO name': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS name="Tr" ${ID}="dos-1"/>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'DOS', id: 'dos-1' },
			expected: 'S1/V1/B1/PTRC1.Tr',
			expectedSegments: [
				{ tagName: 'Substation', segment: 'S1', separator: '/' },
				{ tagName: 'VoltageLevel', segment: 'V1', separator: '/' },
				{ tagName: 'Bay', segment: 'B1', separator: '/' },
				{ tagName: 'LNode', segment: 'PTRC1', separator: '/' },
				{ tagName: 'DOS', segment: 'Tr', separator: '.' },
			],
		},

		'DAS under DOS under LNode/Private (6-100) → dot-separated DO and DA names after LNode': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS name="Tr" ${ID}="dos-1">
										<eIEC61850-6-100:DAS name="general" ${ID}="das-1"/>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'DAS', id: 'das-1' },
			expected: 'S1/V1/B1/PTRC1.Tr.general',
			expectedSegments: [
				{ tagName: 'Substation', segment: 'S1', separator: '/' },
				{ tagName: 'VoltageLevel', segment: 'V1', separator: '/' },
				{ tagName: 'Bay', segment: 'B1', separator: '/' },
				{ tagName: 'LNode', segment: 'PTRC1', separator: '/' },
				{ tagName: 'DOS', segment: 'Tr', separator: '.' },
				{ tagName: 'DAS', segment: 'general', separator: '.' },
			],
		},

		'SDS under DAS under DOS under LNode/Private (6-100) → full dot-separated data path': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="None" lnClass="PTRC" lnInst="1" ${ID}="lnode-1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:DOS name="Tr" ${ID}="dos-1">
									<eIEC61850-6-100:DAS name="general" ${ID}="das-1">
										<eIEC61850-6-100:SDS name="q" ${ID}="sds-1"/>
									</eIEC61850-6-100:DAS>
								</eIEC61850-6-100:DOS>
							</Private>
						</LNode>
					</Bay>
				</Substation>
			</SCL>`,
			ref: { tagName: 'SDS', id: 'sds-1' },
			expected: 'S1/B1/PTRC1.Tr.general.q',
			expectedSegments: [
				{ tagName: 'Substation', segment: 'S1', separator: '/' },
				{ tagName: 'Bay', segment: 'B1', separator: '/' },
				{ tagName: 'LNode', segment: 'PTRC1', separator: '/' },
				{ tagName: 'DOS', segment: 'Tr', separator: '.' },
				{ tagName: 'DAS', segment: 'general', separator: '.' },
				{ tagName: 'SDS', segment: 'q', separator: '.' },
			],
		},

		'DOI under LN in IED hierarchy → dot-separated after LN segment': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="LD0" ${ID}="ld-1">
								<LN lnClass="XCBR" inst="1" prefix="" ${ID}="ln-1">
									<DOI name="Pos" ${ID}="doi-1"/>
								</LN>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			ref: { tagName: 'DOI', id: 'doi-1' },
			expected: 'IED1/LD0/XCBR1.Pos',
			expectedSegments: [
				{ tagName: 'IED', segment: 'IED1', separator: '/' },
				{ tagName: 'LDevice', segment: 'LD0', separator: '/' },
				{ tagName: 'LN', segment: 'XCBR1', separator: '/' },
				{ tagName: 'DOI', segment: 'Pos', separator: '.' },
			],
		},

		'DAI under SDI under DOI under LN in IED hierarchy → full dot-separated data instance path': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="LD0" ${ID}="ld-1">
								<LN lnClass="XCBR" inst="1" prefix="" ${ID}="ln-1">
									<DOI name="Pos" ${ID}="doi-1">
										<SDI name="origin" ${ID}="sdi-1">
											<DAI name="ctlVal" ${ID}="dai-1"/>
										</SDI>
									</DOI>
								</LN>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			ref: { tagName: 'DAI', id: 'dai-1' },
			expected: 'IED1/LD0/XCBR1.Pos.origin.ctlVal',
			expectedSegments: [
				{ tagName: 'IED', segment: 'IED1', separator: '/' },
				{ tagName: 'LDevice', segment: 'LD0', separator: '/' },
				{ tagName: 'LN', segment: 'XCBR1', separator: '/' },
				{ tagName: 'DOI', segment: 'Pos', separator: '.' },
				{ tagName: 'SDI', segment: 'origin', separator: '.' },
				{ tagName: 'DAI', segment: 'ctlVal', separator: '.' },
			],
		},

		'ConductingEquipment under Line → Line name included in slash-separated path': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Line name="L1" ${ID}="line-1">
					<ConductingEquipment type="DIS" name="DIS1" ${ID}="ce-1"/>
				</Line>
			</SCL>`,
			ref: { tagName: 'ConductingEquipment', id: 'ce-1' },
			expected: 'L1/DIS1',
			expectedSegments: [
				{ tagName: 'Line', segment: 'L1', separator: '/' },
				{ tagName: 'ConductingEquipment', segment: 'DIS1', separator: '/' },
			],
		},

		'SubFunction under Function in Substation hierarchy → all named ancestors slash-separated': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<Function name="Prot" ${ID}="func-1">
								<SubFunction name="Trip" ${ID}="sfunc-1"/>
							</Function>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			ref: { tagName: 'SubFunction', id: 'sfunc-1' },
			expected: 'S1/V1/B1/Prot/Trip',
			expectedSegments: [
				{ tagName: 'Substation', segment: 'S1', separator: '/' },
				{ tagName: 'VoltageLevel', segment: 'V1', separator: '/' },
				{ tagName: 'Bay', segment: 'B1', separator: '/' },
				{ tagName: 'Function', segment: 'Prot', separator: '/' },
				{ tagName: 'SubFunction', segment: 'Trip', separator: '/' },
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const query = source.query

		const result = await buildElementPath(query, testCase.ref as never)

		expect(result?.path ?? null).toBe(testCase.expected)

		if (testCase.expectedSegments) {
			expect(
				result!.segments.map((s) => ({
					tagName: s.ref.tagName,
					segment: s.segment,
					separator: s.separator,
				})),
			).toEqual(testCase.expectedSegments)
		}

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
