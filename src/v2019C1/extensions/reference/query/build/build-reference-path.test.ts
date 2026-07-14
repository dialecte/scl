import { buildReferencePath } from './build-reference-path'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	reference: { tagName: string; id: string }
	target: { tagName: string; id: string }
	expected: string | null
}

describe('buildReferencePath', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<TestCase> = {
		// ── direct resolution ────────────────────────────────────────────
		'direct — FunctionRef → Function': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<Function name="Protection" uuid="func-uuid" ${ID}="func-1"/>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeOutputs>
									<eIEC61850-6-100:ControlRef output="Trip" ${ID}="ctrl-1">
										<eIEC61850-6-100:FunctionRef
											function=""
											functionUuid="func-uuid"
											${ID}="fref-1"/>
									</eIEC61850-6-100:ControlRef>
								</eIEC61850-6-100:LNodeOutputs>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'FunctionRef', id: 'fref-1' },
			target: { tagName: 'Function', id: 'func-1' },
			expected: 'S1/V1/B1/Protection',
		},

		'direct — FunctionCategoryRef → FunctionCategory': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<Function name="Prot" uuid="fn-uuid" ${ID}="func-1">
								<eIEC61850-6-100:FunctionCategoryRef
									functionCategory=""
									functionCategoryUuid="cat-uuid"
									${ID}="fcr-1"/>
							</Function>
						</Bay>
					</VoltageLevel>
				</Substation>
				<Private type="eIEC61850-6-100">
				<eIEC61850-6-100:FunctionCategories>
					<eIEC61850-6-100:FunctionCategory name="DistProt" uuid="cat-uuid" ${ID}="cat-1"/>
				</eIEC61850-6-100:FunctionCategories>
				</Private>
			</SCL>`,
			reference: { tagName: 'FunctionCategoryRef', id: 'fcr-1' },
			target: { tagName: 'FunctionCategory', id: 'cat-1' },
			expected: 'DistProt',
		},

		// ── lnode resolution ─────────────────────────────────────────────
		'lnode — SourceRef → LNode with qualifier preserved': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="" uuid="ln-uuid" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef
										input="Trip"
										source="S1/V1/B1/XCBR1.Pos.stVal"
										sourceLNodeUuid="ln-uuid"
										sourceDoName="Pos"
										sourceDaName="stVal"
										${ID}="sr-1"/>
								</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'SourceRef', id: 'sr-1' },
			target: { tagName: 'LNode', id: 'lnode-1' },
			expected: 'S1/V1/B1/XCBR1.Pos.stVal',
		},

		'lnode — SourceRef → LNode without qualifier': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="" uuid="ln-uuid" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef
										input="Trip"
										source="S1/V1/B1/XCBR1"
										sourceLNodeUuid="ln-uuid"
										sourceDoName="Pos"
										sourceDaName="stVal"
										${ID}="sr-1"/>
								</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'SourceRef', id: 'sr-1' },
			target: { tagName: 'LNode', id: 'lnode-1' },
			expected: 'S1/V1/B1/XCBR1',
		},

		// ── ied-address resolution ───────────────────────────────────────
		'ied-address — SourceRef → ExtRef': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<IED name="PIU" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="LD0" ${ID}="ld-1">
								<LN lnClass="XCBR" inst="1" prefix="" ${ID}="ln-1">
									<ExtRef intAddr="TrCmd.stVal" uuid="extref-uuid" ${ID}="extref-1"/>
								</LN>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef
										input="Trip"
										extRefAddr=""
										extRefUuid="extref-uuid"
										${ID}="sr-1"/>
								</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'SourceRef', id: 'sr-1' },
			target: { tagName: 'ExtRef', id: 'extref-1' },
			expected: 'PIU/LD0/XCBR1.TrCmd.stVal',
		},

		// ── behavior-description resolution ──────────────────────────────
		'behavior-description — InputVar → SourceRef (input segment)': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="Trip" uuid="sr-uuid" ${ID}="sr-1">
										<eIEC61850-6-100:BehaviorDescription name="BD1" ${ID}="bd-1">
											<eIEC61850-6-100:InputVar
												inputName=""
												inputUuid="sr-uuid"
												dataName=""
												lnodeUuid=""
												${ID}="iv-1"/>
										</eIEC61850-6-100:BehaviorDescription>
									</eIEC61850-6-100:SourceRef>
								</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'InputVar', id: 'iv-1' },
			target: { tagName: 'SourceRef', id: 'sr-1' },
			expected: 'Trip',
		},

		'behavior-description — OutputVar → ControlRef (output segment)': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeOutputs>
									<eIEC61850-6-100:ControlRef output="TrCmd" uuid="cr-uuid" ${ID}="cr-1">
										<eIEC61850-6-100:BehaviorDescription name="BD1" ${ID}="bd-1">
											<eIEC61850-6-100:OutputVar
												outputName=""
												outputUuid="cr-uuid"
												dataName=""
												lnodeUuid=""
												${ID}="ov-1"/>
										</eIEC61850-6-100:BehaviorDescription>
									</eIEC61850-6-100:ControlRef>
								</eIEC61850-6-100:LNodeOutputs>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'OutputVar', id: 'ov-1' },
			target: { tagName: 'ControlRef', id: 'cr-1' },
			expected: 'TrCmd',
		},

		// ── edge cases ───────────────────────────────────────────────────
		'unsupported (VariableApplyTo) → uuid-derived plain name-path': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<Function name="Prot" uuid="fn-uuid" ${ID}="func-1"/>
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="" uuid="ln-uuid" ${ID}="lnode-1">
								<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:VariableApplyTo
									element=""
									elementUuid="fn-uuid"
									${ID}="va-1"/>
								</Private>
							</LNode>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'VariableApplyTo', id: 'va-1' },
			target: { tagName: 'Function', id: 'func-1' },
			expected: 'S1/V1/B1/Prot',
		},

		'VariableApplyTo → LNode uses LN naming (prefix+lnClass+inst)': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" prefix="A" uuid="ln-uuid" ${ID}="lnode-1"/>
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:Variable name="V" uuid="var-uuid" ${ID}="var-1">
									<eIEC61850-6-100:VariableApplyTo element="" elementUuid="ln-uuid" ${ID}="va-1"/>
								</eIEC61850-6-100:Variable>
							</Private>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'VariableApplyTo', id: 'va-1' },
			target: { tagName: 'LNode', id: 'lnode-1' },
			expected: 'S1/V1/B1/AXCBR1',
		},

		'VariableApplyTo → ConductingEquipment uses its name': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<ConductingEquipment name="QA1" type="CBR" uuid="ce-uuid" ${ID}="ce-1"/>
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:Variable name="V" uuid="var-uuid" ${ID}="var-1">
									<eIEC61850-6-100:VariableApplyTo element="" elementUuid="ce-uuid" ${ID}="va-1"/>
								</eIEC61850-6-100:Variable>
							</Private>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>`,
			reference: { tagName: 'VariableApplyTo', id: 'va-1' },
			target: { tagName: 'ConductingEquipment', id: 'ce-1' },
			expected: 'S1/V1/B1/QA1',
		},

		'VariableApplyTo → a segment-less target (LNodeType) → null (path left untouched)': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:Variable name="V" uuid="var-uuid" ${ID}="var-1">
							<eIEC61850-6-100:VariableApplyTo element="keep-me" elementUuid="lnt-uuid" ${ID}="va-1"/>
						</eIEC61850-6-100:Variable>
					</Private>
				</Substation>
				<DataTypeTemplates ${ID}="dtt-1">
					<LNodeType id="XCBR_Type" lnClass="XCBR" ${ID}="lnt-1"/>
				</DataTypeTemplates>
			</SCL>`,
			reference: { tagName: 'VariableApplyTo', id: 'va-1' },
			target: { tagName: 'LNodeType', id: 'lnt-1' },
			expected: null,
		},

		'unknown pair — sourceRef tagName not in UUID_REFERENCE_PAIRS → null': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1"/>
			</SCL>`,
			reference: { tagName: 'Substation', id: 'sub-1' },
			target: { tagName: 'Substation', id: 'sub-1' },
			expected: null,
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const query = source.query

		const result = await buildReferencePath(query, {
			reference: testCase.reference as never,
			target: testCase.target as never,
		})

		expect(result).toBe(testCase.expected)

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
