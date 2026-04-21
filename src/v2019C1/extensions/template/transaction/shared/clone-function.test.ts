import { ensureSubstationTemplateStructure } from '../ensure-substation-structure'
import { cloneFunction, cloneFunctionCategories } from './clone-function'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
		<Substation ${id}="target-sub" name="TEMPLATE" uuid="target-sub-uuid">
			<VoltageLevel ${id}="target-vl" name="TEMPLATE" uuid="target-vl-uuid">
				<Bay ${id}="target-bay" name="TEMPLATE" uuid="target-bay-uuid"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('cloneFunction + cloneFunctionCategories', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
		targetParentRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
	}

	const act = async ({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> => {
		await target!.document.transaction(async (tx) => {
			const uuidRemap = await cloneFunction(tx, {
				sourceQuery: source.document.query,
				functionRef: testCase.functionRef,
				targetParentRef: testCase.targetParentRef,
			})
			const structure = await ensureSubstationTemplateStructure(tx)
			await cloneFunctionCategories(tx, {
				sourceQuery: source.document.query,
				functionRef: testCase.functionRef,
				structure,
				uuidRemap,
			})
		})
		return { assertDatabaseName: target!.databaseName }
	}

	// ── Function tree cloning ────────────────────────────────────────────────

	describe('Function tree cloned to target', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'Function with SubFunction and LNode → full tree cloned': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func1" name="HMI Function" uuid="func-uuid">
								<SubFunction ${id}="subfunc1" name="HMI" uuid="subfunc-uuid">
									<LNode ${id}="lnode1" iedName="None" lnType="ELIA_IHMI" uuid="lnode-uuid">
										<Private ${id}="lnode-priv" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn1" sIedName="HMI" sLdInst="LD" sLnClass="IHMI" sLnInst="1"/>
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
				functionRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				targetParentRef: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
				expectedQueries: [
					'//default:Function[@name="HMI Function"][@uuid]',
					'//default:Function/default:SubFunction[@name="HMI"][@uuid]',
					'//default:SubFunction/default:LNode[@lnType="ELIA_IHMI"][@uuid]',
					'//v2019C1:LNodeSpecNaming[@sIedName="HMI"][@sLdInst="LD"]',
				],
				unexpectedQueries: [
					// Source uuids must not appear (new uuids generated)
					'//default:Function[@uuid="func-uuid"]',
					'//default:SubFunction[@uuid="subfunc-uuid"]',
				],
			},
			'SubFunction promoted to Function in target': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func-parent" name="Parent" uuid="parent-uuid">
								<SubFunction ${id}="subfunc1" name="Child" uuid="child-uuid">
									<LNode ${id}="lnode1" iedName="None" lnType="ELIA_IHMI" uuid="lnode-uuid">
										<Private ${id}="lnode-priv" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn1" sIedName="IED" sLdInst="LD" sLnClass="IHMI" sLnInst="1"/>
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
				functionRef: { tagName: 'SubFunction', id: 'subfunc1' } as Scl.Ref<'SubFunction'>,
				targetParentRef: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
				expectedQueries: [
					// SubFunction promoted to Function in target
					'//default:Substation/default:Function[@name="Child"][@uuid]',
					'//default:Function[@name="Child"]/default:LNode[@lnType="ELIA_IHMI"]',
				],
				unexpectedQueries: [
					// No SubFunction at root level - it was promoted
					'//default:Substation/default:SubFunction',
					// Parent Function not cloned
					'//default:Function[@name="Parent"]',
				],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})

	// ── FunctionCategory cloning with uuid remapping ─────────────────────────

	describe('FunctionCategory cloned with remapped functionUuid', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'FunctionCatRef pointing to Function → FunctionCategory cloned, functionUuid remapped': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="PROTECTION" uuid="fcat-uuid">
									<eIEC61850-6-100:FunctionCatRef ${id}="fcref1" function="TEMPLATE/ProtFunc" functionUuid="func-uuid"/>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<Function ${id}="func1" name="ProtFunc" uuid="func-uuid"/>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				functionRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				targetParentRef: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
				expectedQueries: [
					'//v2019C1:FunctionCategory[@name="PROTECTION"]',
					'//v2019C1:FunctionCatRef[@functionUuid]',
					'//default:Function[@name="ProtFunc"]',
				],
				unexpectedQueries: [
					// Source functionUuid remapped to new uuid
					'//v2019C1:FunctionCatRef[@functionUuid="func-uuid"]',
				],
			},
			'FunctionCatRef pointing to SubFunction → FunctionCategory cloned after promotion': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="MMS CLIENTS" uuid="fcat-uuid">
									<eIEC61850-6-100:SubCategory ${id}="scat1" name="HMI" uuid="scat-uuid">
										<eIEC61850-6-100:FunctionCatRef ${id}="fcref1" function="TEMPLATE/Parent/Child" functionUuid="subfunc-uuid"/>
									</eIEC61850-6-100:SubCategory>
								</eIEC61850-6-100:FunctionCategory>
							</Private>
							<Function ${id}="func-parent" name="Parent" uuid="parent-uuid">
								<SubFunction ${id}="subfunc1" name="Child" uuid="subfunc-uuid"/>
							</Function>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				functionRef: { tagName: 'SubFunction', id: 'subfunc1' } as Scl.Ref<'SubFunction'>,
				targetParentRef: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
				expectedQueries: [
					'//v2019C1:FunctionCategory[@name="MMS CLIENTS"]',
					'//v2019C1:SubCategory[@name="HMI"]',
					'//v2019C1:FunctionCatRef[@functionUuid]',
				],
				unexpectedQueries: [
					// Source SubFunction uuid remapped
					'//v2019C1:FunctionCatRef[@functionUuid="subfunc-uuid"]',
				],
			},
			'No FunctionCategory referencing Function → only Function cloned': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func1" name="Standalone" uuid="func-uuid"/>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				functionRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				targetParentRef: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
				expectedQueries: ['//default:Function[@name="Standalone"][@uuid]'],
				unexpectedQueries: ['//v2019C1:FunctionCategory'],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})

	// ── DataTypeTemplates extracted during Function clone ─────────────────────

	describe('DataTypeTemplates extracted for LNodes in cloned Function', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'LNode with lnType → full type chain extracted to target': {
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
				functionRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				targetParentRef: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
				expectedQueries: [
					'//default:DataTypeTemplates/default:LNodeType[@id="ELIA_PTOC_V001"][@lnClass="PTOC"]',
					'//default:DataTypeTemplates/default:DOType[@id="ELIA_ACT_V001"][@cdc="ACT"]',
					'//default:DataTypeTemplates/default:DOType[@id="ELIA_ACD_V003"][@cdc="ACD"]',
					'//default:DataTypeTemplates/default:EnumType[@id="FaultDirectionKind"]',
				],
				unexpectedQueries: [],
			},
			'Function without LNode → no DataTypeTemplates created': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
							<Function ${id}="func1" name="EmptyFunc" uuid="func-uuid"/>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				functionRef: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
				targetParentRef: { tagName: 'Substation', id: 'target-sub' } as Scl.Ref<'Substation'>,
				expectedQueries: ['//default:Function[@name="EmptyFunc"]'],
				unexpectedQueries: ['//default:DataTypeTemplates'],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})
})
