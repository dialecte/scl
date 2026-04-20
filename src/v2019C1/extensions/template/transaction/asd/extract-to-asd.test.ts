import { extractToAsd } from './extract-to-asd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="root" version="2007" revision="C" release="5"/>
`

describe('extractToAsd', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		applicationId: string
	}

	const act = async ({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> => {
		await target!.document.transaction(async (tx) => {
			await extractToAsd(tx, {
				sourceQuery: source.document.query,
				applicationRef: {
					tagName: 'Application',
					id: testCase.applicationId,
				} as Scl.Ref<'Application'>,
				tool: 'TEST',
				who: 'test',
			})
		})
		return { assertDatabaseName: target!.databaseName }
	}

	// ── LNodeOutputRef / LNodeInputRef preservation ──────────────────────────

	describe('SignalRole children (LNodeOutputRef, LNodeInputRef) preserved after extraction', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'LNodeOutputRef under SignalRole → remapped controlRefUuid, preserved in output': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub1-uuid">
							<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl1-uuid">
								<Bay ${id}="bay1" name="TEMPLATE" uuid="bay1-uuid"/>
							</VoltageLevel>
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:AllocationRole ${id}="ar1" name="HMI_PC" uuid="ar1-uuid"/>
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="MMS CLIENTS" uuid="fcat1-uuid">
									<eIEC61850-6-100:SubCategory ${id}="scat1" name="HMI" uuid="scat1-uuid">
										<eIEC61850-6-100:FunctionCatRef ${id}="fcref1" function="TEMPLATE/HMI Function/HMI" functionUuid="subfunc-uuid"/>
									</eIEC61850-6-100:SubCategory>
								</eIEC61850-6-100:FunctionCategory>
								<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app1-uuid">
									<eIEC61850-6-100:FunctionRole ${id}="fr1" name="APPLICATION ROOT" uuid="fr1-uuid">
										<eIEC61850-6-100:FunctionRoleContent ${id}="frc1">
											<eIEC61850-6-100:FunctionRef ${id}="fref1" function="TEMPLATE/HMI Function" functionUuid="func-uuid"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
									<eIEC61850-6-100:FunctionRole ${id}="fr2" name="MMS CLIENTS" uuid="fr2-uuid">
										<eIEC61850-6-100:FunctionRoleContent ${id}="frc2">
											<eIEC61850-6-100:FunctionRef ${id}="fref2" function="TEMPLATE/HMI Function/HMI" functionUuid="subfunc-uuid">
												<eIEC61850-6-100:SignalRole ${id}="sr-out" name="Output" uuid="sr-out-uuid">
													<eIEC61850-6-100:LNodeOutputRef ${id}="lnout1" controlRef="TEMPLATE/HMI Function/HMI/IHMI1.HMI_Command(1)" controlRefUuid="ctrlref-uuid"/>
												</eIEC61850-6-100:SignalRole>
												<eIEC61850-6-100:SignalRole ${id}="sr-in" name="Input" uuid="sr-in-uuid">
													<eIEC61850-6-100:LNodeInputRef ${id}="lnin1" sourceRef="TEMPLATE/HMI Function/HMI/IHMI1.Operate(1).general" sourceRefUuid="srcref1-uuid"/>
													<eIEC61850-6-100:LNodeInputRef ${id}="lnin2" sourceRef="TEMPLATE/HMI Function/HMI/IHMI1.Operate(1).q" sourceRefUuid="srcref2-uuid"/>
													<eIEC61850-6-100:LNodeInputRef ${id}="lnin3" sourceRef="TEMPLATE/HMI Function/HMI/IHMI1.Operate(1).t" sourceRefUuid="srcref3-uuid"/>
												</eIEC61850-6-100:SignalRole>
											</eIEC61850-6-100:FunctionRef>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
									<eIEC61850-6-100:AllocationRoleRef ${id}="arref1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
								</eIEC61850-6-100:Application>
							</Private>
							<Function ${id}="func1" name="HMI Function" uuid="func-uuid">
								<SubFunction ${id}="subfunc1" name="HMI" uuid="subfunc-uuid">
									<LNode ${id}="lnode1" iedName="None" lnType="ELIA_IHMI" uuid="lnode-uuid">
										<Private ${id}="lnode-priv" type="eIEC61850-6-100">
											<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn1" sIedName="HMI" sLdInst="HMI_Function" sLnClass="IHMI" sLnInst="1"/>
											<eIEC61850-6-100:LNodeInputs ${id}="lni1">
												<eIEC61850-6-100:SourceRef ${id}="sref1" input="Operate" inputInst="1" pDA="general" pDO="Op" pLN="PTOC" service="Report" uuid="srcref1-uuid"/>
												<eIEC61850-6-100:SourceRef ${id}="sref2" input="Operate" inputInst="1" pDA="q" pDO="Op" pLN="PTOC" service="Report" uuid="srcref2-uuid"/>
												<eIEC61850-6-100:SourceRef ${id}="sref3" input="Operate" inputInst="1" pDA="t" pDO="Op" pLN="PTOC" service="Report" uuid="srcref3-uuid"/>
											</eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:LNodeOutputs ${id}="lno1">
												<eIEC61850-6-100:ControlRef ${id}="cref1" output="HMI_Command" outputInst="1" pDO="Mod" pLN="PTOC" uuid="ctrlref-uuid"/>
											</eIEC61850-6-100:LNodeOutputs>
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
				applicationId: 'app1',
				expectedQueries: [
					// LNodeOutputRef preserved with remapped controlRefUuid (not the source uuid)
					'//v2019C1:LNodeOutputRef[@controlRefUuid]',
					'//v2019C1:LNodeOutputRef[contains(@controlRef, "HMI_Command")]',
					// LNodeInputRef preserved (3 instances)
					'//v2019C1:SignalRole[@name="Input"]/v2019C1:LNodeInputRef[@sourceRefUuid]',
					'//v2019C1:LNodeInputRef[contains(@sourceRef, "Operate")]',
					// SignalRole parent structure intact
					'//v2019C1:SignalRole[@name="Output"]/v2019C1:LNodeOutputRef',
					'//v2019C1:SignalRole[@name="Input"][count(v2019C1:LNodeInputRef)=3]',
				],
				unexpectedQueries: [
					// Source uuids must NOT appear (they should be remapped)
					'//v2019C1:LNodeOutputRef[@controlRefUuid="ctrlref-uuid"]',
					'//v2019C1:LNodeInputRef[@sourceRefUuid="srcref1-uuid"]',
					'//v2019C1:LNodeInputRef[@sourceRefUuid="srcref2-uuid"]',
					'//v2019C1:LNodeInputRef[@sourceRefUuid="srcref3-uuid"]',
				],
			},
			'Application without SignalRole children → extraction succeeds, no LNodeInputRef/LNodeOutputRef':
				{
					sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub1-uuid">
							<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl1-uuid">
								<Bay ${id}="bay1" name="TEMPLATE" uuid="bay1-uuid"/>
							</VoltageLevel>
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:Application ${id}="app1" name="SimpleApp" type="DCS" uuid="app1-uuid">
									<eIEC61850-6-100:FunctionRole ${id}="fr1" name="APPLICATION ROOT" uuid="fr1-uuid">
										<eIEC61850-6-100:FunctionRoleContent ${id}="frc1">
											<eIEC61850-6-100:FunctionRef ${id}="fref1" function="TEMPLATE/SimpleFunc" functionUuid="func-uuid"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
								</eIEC61850-6-100:Application>
							</Private>
							<Function ${id}="func1" name="SimpleFunc" uuid="func-uuid">
								<LNode ${id}="lnode1" iedName="None" lnType="ELIA_IHMI" uuid="lnode-uuid">
									<Private ${id}="lnode-priv" type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeSpecNaming ${id}="lnsn1" sIedName="IED" sLdInst="LD" sLnClass="IHMI" sLnInst="1"/>
									</Private>
								</LNode>
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
					applicationId: 'app1',
					expectedQueries: [
						// Application cloned
						'//v2019C1:Application[@name="SimpleApp"]',
						// Function cloned
						'//default:Function[@name="SimpleFunc"]',
						// DataTypeTemplates extracted
						'//default:DataTypeTemplates/default:LNodeType[@id="ELIA_IHMI"]',
					],
					unexpectedQueries: ['//v2019C1:LNodeOutputRef', '//v2019C1:LNodeInputRef'],
				},
			'FunctionCategory with FunctionCatRef → remapped functionUuid, preserved in output': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub1-uuid">
							<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl1-uuid">
								<Bay ${id}="bay1" name="TEMPLATE" uuid="bay1-uuid"/>
							</VoltageLevel>
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="APP ROOT" uuid="fcat1-uuid">
									<eIEC61850-6-100:FunctionCatRef ${id}="fcref1" function="TEMPLATE/MyFunc" functionUuid="func-uuid"/>
								</eIEC61850-6-100:FunctionCategory>
								<eIEC61850-6-100:Application ${id}="app1" name="TestApp" type="DCS" uuid="app1-uuid">
									<eIEC61850-6-100:FunctionRole ${id}="fr1" name="APPLICATION ROOT" uuid="fr1-uuid">
										<eIEC61850-6-100:FunctionRoleContent ${id}="frc1">
											<eIEC61850-6-100:FunctionRef ${id}="fref1" function="TEMPLATE/MyFunc" functionUuid="func-uuid"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
								</eIEC61850-6-100:Application>
							</Private>
							<Function ${id}="func1" name="MyFunc" uuid="func-uuid"/>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				applicationId: 'app1',
				expectedQueries: [
					'//v2019C1:FunctionCategory[@name="APP ROOT"]',
					'//v2019C1:FunctionCatRef[@functionUuid]',
					'//default:Function[@name="MyFunc"]',
				],
				unexpectedQueries: [
					// Source functionUuid must be remapped
					'//v2019C1:FunctionCatRef[@functionUuid="func-uuid"]',
				],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})

	// ── DataTypeTemplates extraction ─────────────────────────────────────────

	describe('DataTypeTemplates extracted for LNodes under Application scope', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'LNode with lnType → DataTypeTemplates fully extracted': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub1-uuid">
							<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl1-uuid">
								<Bay ${id}="bay1" name="TEMPLATE" uuid="bay1-uuid"/>
							</VoltageLevel>
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app1-uuid">
									<eIEC61850-6-100:FunctionRole ${id}="fr1" name="APPLICATION ROOT" uuid="fr1-uuid">
										<eIEC61850-6-100:FunctionRoleContent ${id}="frc1">
											<eIEC61850-6-100:FunctionRef ${id}="fref1" function="TEMPLATE/HMI Function" functionUuid="func-uuid"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
								</eIEC61850-6-100:Application>
							</Private>
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
								<DO ${id}="do2" name="Beh" type="ELIA_ENS_Beh"/>
							</LNodeType>
							<DOType ${id}="dot1" id="ELIA_ENC_Mod" cdc="ENC">
								<DA ${id}="da1" bType="Enum" name="stVal" type="ELIA_BehaviourModeKind" fc="ST"/>
								<DA ${id}="da2" bType="Quality" name="q" fc="ST"/>
							</DOType>
							<DOType ${id}="dot2" id="ELIA_ENS_Beh" cdc="ENS">
								<DA ${id}="da3" bType="Enum" name="stVal" type="ELIA_BehaviourModeKind" fc="ST"/>
							</DOType>
							<EnumType ${id}="et1" id="ELIA_BehaviourModeKind">
								<EnumVal ${id}="ev1" ord="1">on</EnumVal>
								<EnumVal ${id}="ev2" ord="2">blocked</EnumVal>
							</EnumType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				applicationId: 'app1',
				expectedQueries: [
					'//default:DataTypeTemplates/default:LNodeType[@id="ELIA_IHMI"][@lnClass="IHMI"]',
					'//default:DataTypeTemplates/default:DOType[@id="ELIA_ENC_Mod"][@cdc="ENC"]',
					'//default:DataTypeTemplates/default:DOType[@id="ELIA_ENS_Beh"][@cdc="ENS"]',
					'//default:DataTypeTemplates/default:EnumType[@id="ELIA_BehaviourModeKind"]',
				],
				unexpectedQueries: [],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})

	// ── AllocationRole cloning ───────────────────────────────────────────────

	describe('AllocationRole referenced by Application → cloned to target', () => {
		const testCases: SclTest.TestCases<TestCase> = {
			'AllocationRoleRef → AllocationRole cloned with new uuid': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
						<Substation ${id}="sub1" name="TEMPLATE" uuid="sub1-uuid">
							<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl1-uuid">
								<Bay ${id}="bay1" name="TEMPLATE" uuid="bay1-uuid"/>
							</VoltageLevel>
							<Private ${id}="sub-priv" type="eIEC61850-6-100">
								<eIEC61850-6-100:AllocationRole ${id}="ar1" name="HMI_PC" uuid="ar1-uuid">
									<eIEC61850-6-100:FunctionRef ${id}="ar-fref1" function="TEMPLATE/Func" functionUuid="func-uuid"/>
								</eIEC61850-6-100:AllocationRole>
								<eIEC61850-6-100:Application ${id}="app1" name="HMI" type="DCS" uuid="app1-uuid">
									<eIEC61850-6-100:FunctionRole ${id}="fr1" name="APPLICATION ROOT" uuid="fr1-uuid">
										<eIEC61850-6-100:FunctionRoleContent ${id}="frc1">
											<eIEC61850-6-100:FunctionRef ${id}="fref1" function="TEMPLATE/Func" functionUuid="func-uuid"/>
										</eIEC61850-6-100:FunctionRoleContent>
									</eIEC61850-6-100:FunctionRole>
									<eIEC61850-6-100:AllocationRoleRef ${id}="arref1" allocationRole="TEMPLATE/HMI_PC" allocationRoleUuid="ar1-uuid"/>
								</eIEC61850-6-100:Application>
							</Private>
							<Function ${id}="func1" name="Func" uuid="func-uuid"/>
						</Substation>
					</SCL>
				`,
				targetXml: emptyTargetXml,
				applicationId: 'app1',
				expectedQueries: [
					'//v2019C1:AllocationRole[@name="HMI_PC"][@uuid]',
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid]',
				],
				unexpectedQueries: [
					// Source uuid must be remapped
					'//v2019C1:AllocationRole[@uuid="ar1-uuid"]',
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid="ar1-uuid"]',
				],
			},
		}

		runSclTestCases.withExport<TestCase>({
			testCases,
			act,
		})
	})
})
