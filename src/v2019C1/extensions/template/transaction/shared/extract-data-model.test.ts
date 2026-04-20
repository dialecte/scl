import { extractDataModel } from './extract-data-model'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5"/>
`

describe('extractDataModel', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		scopeRef: Scl.Ref<Scl.ElementsOf>
	}

	const act = async ({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> => {
		await target!.document.transaction(async (tx) => {
			await extractDataModel(tx, {
				sourceQuery: source.document.query,
				scopeRef: testCase.scopeRef,
			})
		})
		return { assertDatabaseName: target!.databaseName }
	}

	// ── Full type chain extraction ───────────────────────────────────────────

	describe('LNode lnType → full type chain extracted', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'Single LNode → LNodeType + DOTypes + EnumType extracted': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func1" name="ProtFunc" uuid="func-uuid">
								<SubFunction ${id}="subfunc1" name="PTOC" uuid="subfunc-uuid">
									<LNode ${id}="lnode1" iedName="None" lnType="ELIA_PTOC_V001" uuid="lnode-uuid">
										<Private ${id}="lnode-priv" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn1" sIedName="P1" sLdInst="Prot" sLnClass="PTOC" sLnInst="1"/>
										</Private>
									</LNode>
								</SubFunction>
							</Function>
						</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType ${id}="lnt1" id="ELIA_PTOC_V001" lnClass="PTOC">
								<DO ${id}="do1" name="Op" type="ELIA_ACT_V001"/>
								<DO ${id}="do2" name="Str" type="ELIA_ACD_V003"/>
							</LNodeType>
							<DOType ${id}="dot1" id="ELIA_ACT_V001" cdc="ACT">
								<DA ${id}="da1" bType="BOOLEAN" name="general" fc="ST"/>
								<DA ${id}="da2" bType="Quality" name="q" fc="ST"/>
							</DOType>
							<DOType ${id}="dot2" id="ELIA_ACD_V003" cdc="ACD">
								<DA ${id}="da3" bType="BOOLEAN" name="general" fc="ST"/>
								<DA ${id}="da4" bType="Enum" name="dirGeneral" type="FaultDirectionKind" fc="ST"/>
							</DOType>
							<EnumType ${id}="et1" id="FaultDirectionKind">
								<EnumVal ${id}="ev1" ord="0">unknown</EnumVal>
								<EnumVal ${id}="ev2" ord="1">forward</EnumVal>
							</EnumType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				scopeRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				expectedQueries: [
					'//default:DataTypeTemplates/default:LNodeType[@id="ELIA_PTOC_V001"][@lnClass="PTOC"]',
					'//default:LNodeType/default:DO[@name="Op"][@type="ELIA_ACT_V001"]',
					'//default:LNodeType/default:DO[@name="Str"][@type="ELIA_ACD_V003"]',
					'//default:DataTypeTemplates/default:DOType[@id="ELIA_ACT_V001"][@cdc="ACT"]',
					'//default:DataTypeTemplates/default:DOType[@id="ELIA_ACD_V003"][@cdc="ACD"]',
					'//default:DataTypeTemplates/default:EnumType[@id="FaultDirectionKind"]',
				],
				unexpectedQueries: [],
			},
			'Multiple LNodes with shared types → no duplicates in DataTypeTemplates': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func1" name="HMI Function" uuid="func-uuid">
								<SubFunction ${id}="subfunc1" name="HMI1" uuid="sf1-uuid">
									<LNode ${id}="lnode1" iedName="None" lnType="ELIA_IHMI" uuid="ln1-uuid">
										<Private ${id}="ln1-priv" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn1" sIedName="HMI" sLdInst="LD" sLnClass="IHMI" sLnInst="1"/>
										</Private>
									</LNode>
								</SubFunction>
								<SubFunction ${id}="subfunc2" name="HMI2" uuid="sf2-uuid">
									<LNode ${id}="lnode2" iedName="None" lnType="ELIA_IHMI" uuid="ln2-uuid">
										<Private ${id}="ln2-priv" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn2" sIedName="HMI" sLdInst="LD" sLnClass="IHMI" sLnInst="2"/>
										</Private>
									</LNode>
								</SubFunction>
							</Function>
						</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType ${id}="lnt1" id="ELIA_IHMI" lnClass="IHMI">
								<DO ${id}="do1" name="Mod" type="ELIA_ENC_Mod"/>
							</LNodeType>
							<DOType ${id}="dot1" id="ELIA_ENC_Mod" cdc="ENC">
								<DA ${id}="da1" bType="Enum" name="stVal" type="ELIA_BehaviourModeKind" fc="ST"/>
							</DOType>
							<EnumType ${id}="et1" id="ELIA_BehaviourModeKind">
								<EnumVal ${id}="ev1" ord="1">on</EnumVal>
							</EnumType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				scopeRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				expectedQueries: [
					// Only one LNodeType despite two LNodes sharing it
					'//default:DataTypeTemplates[count(default:LNodeType)=1]',
					'//default:DataTypeTemplates/default:LNodeType[@id="ELIA_IHMI"]',
					'//default:DataTypeTemplates[count(default:DOType)=1]',
					'//default:DataTypeTemplates[count(default:EnumType)=1]',
				],
				unexpectedQueries: [],
			},
			'Scope without LNode → no DataTypeTemplates created': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func1" name="EmptyFunc" uuid="func-uuid"/>
						</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType ${id}="lnt1" id="ELIA_IHMI" lnClass="IHMI">
								<DO ${id}="do1" name="Mod" type="ELIA_ENC_Mod"/>
							</LNodeType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				scopeRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				expectedQueries: [],
				unexpectedQueries: [
					// No DataTypeTemplates because no LNode under scope
					'//default:DataTypeTemplates',
				],
			},
			'LNode with DAType chain → DAType extracted too': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func1" name="Func" uuid="func-uuid">
								<LNode ${id}="lnode1" iedName="None" lnType="ELIA_XCBR" uuid="lnode-uuid">
									<Private ${id}="lnode-priv" type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn1" sIedName="P1" sLdInst="CB" sLnClass="XCBR" sLnInst="1"/>
									</Private>
								</LNode>
							</Function>
						</Substation>
						<DataTypeTemplates ${id}="dtt">
							<LNodeType ${id}="lnt1" id="ELIA_XCBR" lnClass="XCBR">
								<DO ${id}="do1" name="Pos" type="ELIA_DPC"/>
							</LNodeType>
							<DOType ${id}="dot1" id="ELIA_DPC" cdc="DPC">
								<DA ${id}="da1" bType="Struct" name="SBOw" type="ELIA_DPCSelectWithValue" fc="CO"/>
								<DA ${id}="da2" bType="Struct" name="Oper" type="ELIA_DPCOperate" fc="CO"/>
							</DOType>
							<DAType ${id}="dat1" id="ELIA_DPCSelectWithValue">
								<BDA ${id}="bda1" bType="Struct" name="origin" type="ELIA_Originator"/>
								<BDA ${id}="bda2" bType="Enum" name="ctlVal" type="BehaviourModeKind"/>
							</DAType>
							<DAType ${id}="dat2" id="ELIA_DPCOperate">
								<BDA ${id}="bda3" bType="Struct" name="origin" type="ELIA_Originator"/>
							</DAType>
							<DAType ${id}="dat3" id="ELIA_Originator">
								<BDA ${id}="bda4" bType="Enum" name="orCat" type="OriginatorCategoryKind"/>
							</DAType>
							<EnumType ${id}="et1" id="BehaviourModeKind">
								<EnumVal ${id}="ev1" ord="1">on</EnumVal>
							</EnumType>
							<EnumType ${id}="et2" id="OriginatorCategoryKind">
								<EnumVal ${id}="ev2" ord="0">not-supported</EnumVal>
							</EnumType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				scopeRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				expectedQueries: [
					'//default:DataTypeTemplates/default:LNodeType[@id="ELIA_XCBR"]',
					'//default:DataTypeTemplates/default:DOType[@id="ELIA_DPC"][@cdc="DPC"]',
					'//default:DataTypeTemplates/default:DAType[@id="ELIA_DPCSelectWithValue"]',
					'//default:DataTypeTemplates/default:DAType[@id="ELIA_DPCOperate"]',
					'//default:DataTypeTemplates/default:DAType[@id="ELIA_Originator"]',
					'//default:DataTypeTemplates/default:EnumType[@id="BehaviourModeKind"]',
					'//default:DataTypeTemplates/default:EnumType[@id="OriginatorCategoryKind"]',
				],
				unexpectedQueries: [],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})
})
