import { resolveElementPath } from './resolve-element-path'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

// ── Integration tests: resolveByPath ─────────────────────────────────

type ResolveByPathTestCase = SclTest.BaseXmlTestCase & {
	path: string
	expected: { tagName: string; id: string } | null
}

describe('resolveByPath', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<ResolveByPathTestCase> = {
		'LNode bound to an IED, named by its specified naming — "S1/F1/XCBR1" → that LNode': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Function name="F1" ${ID}="f1">
						<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" ${ID}="breaker">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${ID}="breaker-naming"/>
							</Private>
						</LNode>
						<LNode iedName="None" lnClass="XCBR" lnInst="3" ${ID}="other-breaker">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="3" ${ID}="other-naming"/>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>`,
			path: 'S1/F1/XCBR1',
			expected: { tagName: 'LNode', id: 'breaker' },
		},

		'LNode bound to an IED, named by the IED naming — "S1/F1/Q0XCBR2" → nothing': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Function name="F1" ${ID}="f1">
						<LNode iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" ${ID}="breaker">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${ID}="breaker-naming"/>
							</Private>
						</LNode>
						<LNode iedName="None" lnClass="XCBR" lnInst="3" ${ID}="other-breaker">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="3" ${ID}="other-naming"/>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>`,
			path: 'S1/F1/Q0XCBR2',
			expected: null,
		},

		'process section — named element chain': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<ConductingEquipment name="CE1" ${ID}="ce-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			path: 'S1/V1/B1/CE1',
			expected: { tagName: 'ConductingEquipment', id: 'ce-1' },
		},

		'signal named among its siblings — "PTRC1.Trip(1).general" → that SourceRef': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Function name="F1" ${ID}="f1">
						<LNode lnClass="PTRC" lnInst="1" ${ID}="lnode-1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${ID}="inputs-1">
									<eIEC61850-6-100:SourceRef input="Trip" ${ID}="sr-1-plain"/>
									<eIEC61850-6-100:SourceRef input="Trip" pDA="general" ${ID}="sr-2-general"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>`,
			path: 'S1/F1/PTRC1.Trip(1).general',
			expected: { tagName: 'SourceRef', id: 'sr-2-general' },
		},

		'signal with a dot in its name — "PTRC1.PTOC1.Op" → that SourceRef': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Function name="F1" ${ID}="f1">
						<LNode lnClass="PTRC" lnInst="1" ${ID}="lnode-1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${ID}="inputs-1">
									<eIEC61850-6-100:SourceRef input="PTOC1.Op" ${ID}="sr-op"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>`,
			path: 'S1/F1/PTRC1.PTOC1.Op',
			expected: { tagName: 'SourceRef', id: 'sr-op' },
		},

		'IED section — AccessPoint and Server transparent': {
			sourceXml: `
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
			path: 'IED1/LD0/XCBR1',
			expected: { tagName: 'LN', id: 'ln-1' },
		},

		'LNode with prefix': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="P" ${ID}="lnode-1"/>
					</Bay>
				</Substation>
			</SCL>`,
			path: 'S1/B1/PXCBR1',
			expected: { tagName: 'LNode', id: 'lnode-1' },
		},

		'SourceRef — dot separator': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="P" ${ID}="lnode-1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${ID}="inputs-1">
									<eIEC61850-6-100:SourceRef input="Trip" ${ID}="sr-1"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Bay>
				</Substation>
			</SCL>`,
			path: 'S1/B1/PXCBR1.Trip',
			expected: { tagName: 'SourceRef', id: 'sr-1' },
		},

		'Function > SubFunction — nested named elements': {
			sourceXml: `
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
			path: 'S1/V1/B1/Prot/Trip',
			expected: { tagName: 'SubFunction', id: 'sfunc-1' },
		},

		'IED section — same name as Substation requires backtracking': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="TEMPLATE" ${ID}="sub-1">
					<VoltageLevel name="TEMPLATE" ${ID}="vl-1">
						<Bay name="TEMPLATE" ${ID}="bay-1"/>
					</VoltageLevel>
				</Substation>
				<IED name="TEMPLATE" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="Measurement" ${ID}="ld-1">
								<LN lnClass="MMXU" inst="1" prefix="" ${ID}="ln-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			path: 'TEMPLATE/Measurement/MMXU1',
			expected: { tagName: 'LN', id: 'ln-1' },
		},

		'non-existent path — returns null': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1"/>
				</Substation>
			</SCL>`,
			path: 'S1/NonExistent',
			expected: null,
		},

		'empty path — returns undefined': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1"/>
			</SCL>`,
			path: '',
			expected: null,
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<ResolveByPathTestCase>): Promise<SclTest.ActResult> {
		const query = source.query

		const result = await resolveElementPath(query, testCase.path)

		if (testCase.expected === null) {
			expect(result).toBeUndefined()
		} else {
			expect(result).toBeDefined()
			expect(result!.tagName).toBe(testCase.expected.tagName)
			expect(result!.id).toBe(testCase.expected.id)
		}

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
