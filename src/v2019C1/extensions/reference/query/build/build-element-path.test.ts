import { buildElementPath } from './build-element-path'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	ref: { tagName: string; id: string }
	expected: string | null
}

describe('buildElementPath', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<TestCase> = {
		'process section — named element chain': {
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
		},

		'IED section — AccessPoint and Server transparent': {
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
		},

		'LNode with lnClass composite': {
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
		},

		'SourceRef — dot separator': {
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
		},

		'SCL root — no extractors match → null': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1"/>
			</SCL>`,
			ref: { tagName: 'SCL', id: 'scl-1' },
			expected: null,
		},

		'Function > SubFunction — nested named elements': {
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
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const query = source.document.query

		const result = await buildElementPath(query, testCase.ref as never)

		expect(result).toBe(testCase.expected)

		return { assertDatabaseName: source.databaseName }
	}

	runSclTestCases.withExport({ testCases, act })
})
