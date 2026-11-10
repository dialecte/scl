import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	collectSclOutputViolations,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * Project P.ssd: substation S1 / V1 with bays B1 and B2; specification IEDs A and B, real IED R (from a supplier ICD);
 * subnetwork N1 connects A and B, N2 connects A only.
 * - B1: F1 (all LNodes on A: X publishes with a value on its data, Y subscribes to it, a behaviour description, a
 *   label), F2 (subfunction Control on A fed by B's LNode, subfunction Interlock on B, one LNode on no IED, a behaviour
 *   description using A's and B's LNodes), breaker QA1 whose
 *   equipment function has an LNode on A. B2: F3, LNodes on B only.
 * - A: gcb1 publishes X to Y (A is its own receiver) and to B; Y's input subscribes to gcb1, the input of A's F2 LNode
 *   to B's gcbB, PTOC1's input to R's gcbR.
 * - Types: each IED's LNs and LNodes name their own, A's shared with B only for LLN0 and PTRC.
 */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project-p">
		<Header id="P" fileType="SSD" uuid="10000000-0000-4000-8000-000000000001" version="1" revision="A" ${id}="project-header"/>
		<Substation name="S1" uuid="11000000-0000-4000-8000-000000000001" ${id}="substation-s1">
			<VoltageLevel name="V1" uuid="11000000-0000-4000-8000-000000000002" ${id}="voltage-level-v1">
				<Bay name="B1" uuid="11000000-0000-4000-8000-000000000003" ${id}="bay-b1">
					<ConductingEquipment name="QA1" type="CBR" uuid="11000000-0000-4000-8000-000000000004" ${id}="breaker-qa1">
						<EqFunction name="BreakerControl" uuid="11000000-0000-4000-8000-000000000005" ${id}="breaker-function-on-a">
							<LNode iedName="A" ldInst="LD1" prefix="" lnClass="XCBR" lnInst="1" lnType="XCBR_T" lnUuid="50000000-0000-4000-8000-0000000000a3" uuid="80000000-0000-4000-8000-000000000007" ${id}="breaker-lnode-on-a"/>
						</EqFunction>
					</ConductingEquipment>
					<Function name="F1" uuid="12000000-0000-4000-8000-000000000001" ${id}="function-all-on-a">
						<Private type="eIEC61850-6-100" ${id}="f1-private">
							<eIEC61850-6-100:BehaviorDescription name="ReclosingLogic" uuid="13000000-0000-4000-8000-000000000001" ${id}="behaviour-all-on-a">
								<eIEC61850-6-100:InputVar varName="trip" lnodeUuid="80000000-0000-4000-8000-000000000001" doName="Op" daName="general" ${id}="behaviour-input-x"/>
								<eIEC61850-6-100:OutputVar varName="block" lnodeUuid="80000000-0000-4000-8000-000000000002" doName="Op" daName="general" ${id}="behaviour-output-y"/>
							</eIEC61850-6-100:BehaviorDescription>
						</Private>
						<Labels ${id}="f1-labels">
							<Label id="F1" lang="en" ${id}="f1-label">Line protection</Label>
						</Labels>
						<LNode iedName="A" ldInst="LD1" prefix="" lnClass="PTRC" lnInst="1" lnType="PTRC_T" lnUuid="50000000-0000-4000-8000-0000000000a1" uuid="80000000-0000-4000-8000-000000000001" ${id}="x-lnode-on-a">
							<Private type="eIEC61850-6-100" ${id}="x-lnode-private">
								<eIEC61850-6-100:DOS name="Op" ${id}="x-lnode-op">
									<eIEC61850-6-100:DAS name="general" ${id}="x-lnode-op-general">
										<eIEC61850-6-100:Val>false</eIEC61850-6-100:Val>
									</eIEC61850-6-100:DAS>
								</eIEC61850-6-100:DOS>
							</Private>
						</LNode>
						<LNode iedName="A" ldInst="LD1" prefix="" lnClass="RREC" lnInst="1" lnType="RREC_T" lnUuid="50000000-0000-4000-8000-0000000000a2" uuid="80000000-0000-4000-8000-000000000002" ${id}="y-lnode-on-a">
							<Private type="eIEC61850-6-100" ${id}="y-lnode-private">
								<eIEC61850-6-100:LNodeInputs ${id}="y-lnode-inputs">
									<eIEC61850-6-100:SourceRef input="BlockReclose" service="GOOSE" pDO="Op" pDA="general" sourceLNodeUuid="80000000-0000-4000-8000-000000000001" sourceDoName="Op" sourceDaName="general" extRefUuid="70000000-0000-4000-8000-0000000000a2" uuid="90000000-0000-4000-8000-000000000001" ${id}="internal-flow-x-to-y"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Function>
					<Function name="F2" uuid="12000000-0000-4000-8000-000000000002" ${id}="function-shared-a-b">
						<Private type="eIEC61850-6-100" ${id}="f2-private">
							<eIEC61850-6-100:BehaviorDescription name="InterlockLogic" uuid="13000000-0000-4000-8000-000000000002" ${id}="behaviour-across-a-b">
								<eIEC61850-6-100:InputVar varName="enable" lnodeUuid="80000000-0000-4000-8000-000000000004" doName="EnaOpn" daName="stVal" ${id}="behaviour-input-b"/>
								<eIEC61850-6-100:OutputVar varName="position" lnodeUuid="80000000-0000-4000-8000-000000000003" doName="Pos" daName="stVal" ${id}="behaviour-output-a"/>
							</eIEC61850-6-100:BehaviorDescription>
						</Private>
						<LNode iedName="None" lnClass="GGIO" lnInst="1" lnType="GGIO_T" uuid="80000000-0000-4000-8000-000000000005" ${id}="f2-lnode-unallocated"/>
						<SubFunction name="Control" uuid="12000000-0000-4000-8000-000000000004" ${id}="subfunction-on-a">
							<LNode iedName="A" ldInst="LD1" prefix="" lnClass="CSWI" lnInst="1" lnType="CSWI_T" lnUuid="50000000-0000-4000-8000-0000000000a4" uuid="80000000-0000-4000-8000-000000000003" ${id}="f2-lnode-on-a">
								<Private type="eIEC61850-6-100" ${id}="f2-lnode-on-a-private">
									<eIEC61850-6-100:LNodeInputs ${id}="f2-lnode-on-a-inputs">
										<eIEC61850-6-100:SourceRef input="Interlock" service="GOOSE" pDO="EnaOpn" pDA="stVal" sourceLNodeUuid="80000000-0000-4000-8000-000000000004" sourceDoName="EnaOpn" sourceDaName="stVal" extRefUuid="70000000-0000-4000-8000-0000000000a4" uuid="90000000-0000-4000-8000-000000000002" ${id}="flow-b-to-a"/>
									</eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:LNodeOutputs ${id}="f2-lnode-on-a-outputs">
										<eIEC61850-6-100:ControlRef output="Release" pDO="Mod" controlledLNodeUuid="80000000-0000-4000-8000-000000000004" controlledDoName="Mod" uuid="90000000-0000-4000-8000-000000000003" ${id}="control-a-to-b"/>
									</eIEC61850-6-100:LNodeOutputs>
								</Private>
							</LNode>
						</SubFunction>
						<SubFunction name="Interlock" uuid="12000000-0000-4000-8000-000000000005" ${id}="subfunction-only-on-b">
							<LNode iedName="B" ldInst="LD1" prefix="" lnClass="CILO" lnInst="1" lnType="CILO_T" lnUuid="50000000-0000-4000-8000-0000000000b1" uuid="80000000-0000-4000-8000-000000000004" ${id}="f2-lnode-on-b"/>
						</SubFunction>
					</Function>
				</Bay>
				<Bay name="B2" uuid="11000000-0000-4000-8000-000000000006" ${id}="bay-b2">
					<Function name="F3" uuid="12000000-0000-4000-8000-000000000003" ${id}="function-only-on-b">
						<LNode iedName="B" ldInst="LD1" prefix="" lnClass="PTRC" lnInst="1" lnType="PTRC_T" lnUuid="50000000-0000-4000-8000-0000000000b2" uuid="80000000-0000-4000-8000-000000000006" ${id}="f3-lnode-on-b"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<Communication ${id}="communication">
			<SubNetwork name="N1" type="8-MMS" uuid="14000000-0000-4000-8000-000000000001" ${id}="subnetwork-shared-a-b">
				<ConnectedAP iedName="A" apName="AP1" ${id}="n1-a">
					<Address>
						<P type="IP">10.0.1.1</P>
					</Address>
				</ConnectedAP>
				<ConnectedAP iedName="B" apName="AP1" ${id}="n1-b">
					<Address>
						<P type="IP">10.0.1.2</P>
					</Address>
				</ConnectedAP>
			</SubNetwork>
			<SubNetwork name="N2" type="8-MMS" uuid="14000000-0000-4000-8000-000000000002" ${id}="subnetwork-only-a">
				<ConnectedAP iedName="A" apName="AP2" ${id}="n2-a">
					<Address>
						<P type="IP">10.0.2.1</P>
					</Address>
				</ConnectedAP>
			</SubNetwork>
		</Communication>
		<IED name="A" uuid="20000000-0000-4000-8000-00000000000a" ${id}="ied-a">
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-0000000000a1" ${id}="a-ap1">
				<Server>
					<Authentication/>
					<LDevice inst="LD1" uuid="40000000-0000-4000-8000-0000000000a1" ${id}="a-ld1">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="50000000-0000-4000-8000-0000000000a0" ${id}="a-ln0">
							<DataSet name="DS1" ${id}="a-dataset">
								<FCDA ldInst="LD1" prefix="" lnClass="PTRC" lnInst="1" doName="Op" daName="general" fc="ST"/>
							</DataSet>
							<GSEControl name="gcb1" datSet="DS1" appID="A_gcb1" confRev="1" uuid="60000000-0000-4000-8000-0000000000a1" ${id}="a-gcb1">
								<IEDName apRef="AP1" ldInst="LD1" prefix="" lnClass="RREC" lnInst="1" ${id}="gcb1-self-receiver">A</IEDName>
								<IEDName apRef="AP1" ldInst="LD1" prefix="" lnClass="CILO" lnInst="1" ${id}="gcb1-receiver-b">B</IEDName>
							</GSEControl>
						</LN0>
						<LN lnClass="PTRC" inst="1" prefix="" lnType="PTRC_T" uuid="50000000-0000-4000-8000-0000000000a1" ${id}="x-ln"/>
						<LN lnClass="RREC" inst="1" prefix="" lnType="RREC_T" uuid="50000000-0000-4000-8000-0000000000a2" ${id}="y-ln">
							<Inputs>
								<ExtRef intAddr="BlockReclose" desc="Block reclose" pDO="Op" pDA="general" pServT="GOOSE" iedName="A" ldInst="LD1" prefix="" lnClass="PTRC" lnInst="1" doName="Op" daName="general" serviceType="GOOSE" srcLDInst="LD1" srcPrefix="" srcLNClass="LLN0" srcCBName="gcb1" uuid="70000000-0000-4000-8000-0000000000a2" ${id}="y-input-from-gcb1"/>
							</Inputs>
						</LN>
						<LN lnClass="XCBR" inst="1" prefix="" lnType="XCBR_T" uuid="50000000-0000-4000-8000-0000000000a3" ${id}="breaker-ln"/>
						<LN lnClass="CSWI" inst="1" prefix="" lnType="CSWI_T" uuid="50000000-0000-4000-8000-0000000000a4" ${id}="f2-ln-on-a">
							<Inputs>
								<ExtRef intAddr="Interlock" desc="Interlock release" pDO="EnaOpn" pDA="stVal" pServT="GOOSE" iedName="B" ldInst="LD1" prefix="" lnClass="CILO" lnInst="1" doName="EnaOpn" daName="stVal" serviceType="GOOSE" srcLDInst="LD1" srcPrefix="" srcLNClass="LLN0" srcCBName="gcbB" uuid="70000000-0000-4000-8000-0000000000a4" ${id}="input-from-b"/>
							</Inputs>
						</LN>
						<LN lnClass="PTOC" inst="1" prefix="" lnType="PTOC_T" uuid="50000000-0000-4000-8000-0000000000a5" ${id}="ln-fed-by-r">
							<Inputs>
								<ExtRef intAddr="RemoteTrip" desc="Remote trip" pDO="Op" pDA="general" pServT="GOOSE" iedName="R" ldInst="LD1" prefix="" lnClass="PTRC" lnInst="1" doName="Op" daName="general" serviceType="GOOSE" srcLDInst="LD1" srcPrefix="" srcLNClass="LLN0" srcCBName="gcbR" uuid="70000000-0000-4000-8000-0000000000a5" ${id}="input-from-r"/>
							</Inputs>
						</LN>
					</LDevice>
				</Server>
			</AccessPoint>
			<AccessPoint name="AP2" uuid="30000000-0000-4000-8000-0000000000a2" ${id}="a-ap2"/>
			<Labels ${id}="a-labels">
				<Label id="A" lang="en" ${id}="a-label">Bay controller</Label>
			</Labels>
		</IED>
		<IED name="B" uuid="20000000-0000-4000-8000-00000000000b" ${id}="ied-b">
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-0000000000b1" ${id}="b-ap1">
				<Server>
					<Authentication/>
					<LDevice inst="LD1" uuid="40000000-0000-4000-8000-0000000000b1" ${id}="b-ld1">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="50000000-0000-4000-8000-0000000000b0" ${id}="b-ln0">
							<DataSet name="DSB" ${id}="b-dataset">
								<FCDA ldInst="LD1" prefix="" lnClass="CILO" lnInst="1" doName="EnaOpn" daName="stVal" fc="ST"/>
							</DataSet>
							<GSEControl name="gcbB" datSet="DSB" appID="B_gcbB" confRev="1" uuid="60000000-0000-4000-8000-0000000000b1" ${id}="b-gcb">
								<IEDName apRef="AP1" ldInst="LD1" prefix="" lnClass="CSWI" lnInst="1">A</IEDName>
							</GSEControl>
						</LN0>
						<LN lnClass="CILO" inst="1" prefix="" lnType="CILO_T" uuid="50000000-0000-4000-8000-0000000000b1" ${id}="f2-ln-on-b"/>
						<LN lnClass="PTRC" inst="1" prefix="" lnType="PTRC_T" uuid="50000000-0000-4000-8000-0000000000b2" ${id}="f3-ln-on-b"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED name="R" manufacturer="Supplier" uuid="20000000-0000-4000-8000-00000000000c" ${id}="ied-r">
			<IEDSourceFiles ${id}="r-source-files">
				<SclFileReference fileType="ICD" fileName="R_supplier" fileUuid="10000000-0000-4000-8000-000000000002" version="1" revision="A" ${id}="r-from-supplier-icd"/>
			</IEDSourceFiles>
			<AccessPoint name="AP1" uuid="30000000-0000-4000-8000-0000000000c1" ${id}="r-ap1">
				<Server>
					<Authentication/>
					<LDevice inst="LD1" uuid="40000000-0000-4000-8000-0000000000c1" ${id}="r-ld1">
						<LN0 lnClass="LLN0" inst="" lnType="R_LLN0_T" uuid="50000000-0000-4000-8000-0000000000c0" ${id}="r-ln0">
							<DataSet name="DSR" ${id}="r-dataset">
								<FCDA ldInst="LD1" prefix="" lnClass="PTRC" lnInst="1" doName="Op" daName="general" fc="ST"/>
							</DataSet>
							<GSEControl name="gcbR" datSet="DSR" appID="R_gcbR" confRev="1" uuid="60000000-0000-4000-8000-0000000000c1" ${id}="r-gcb">
								<IEDName apRef="AP1" ldInst="LD1" prefix="" lnClass="PTOC" lnInst="1">A</IEDName>
							</GSEControl>
						</LN0>
						<LN lnClass="PTRC" inst="1" prefix="" lnType="R_PTRC_T" uuid="50000000-0000-4000-8000-0000000000c1" ${id}="r-ptrc"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="types">
			<LNodeType id="LLN0_T" lnClass="LLN0">
				<DO name="Beh" type="SPS_T"/>
			</LNodeType>
			<LNodeType id="PTRC_T" lnClass="PTRC">
				<DO name="Op" type="ACT_T"/>
			</LNodeType>
			<LNodeType id="RREC_T" lnClass="RREC">
				<DO name="Op" type="ACT_T"/>
			</LNodeType>
			<LNodeType id="XCBR_T" lnClass="XCBR">
				<DO name="Pos" type="DPS_T"/>
			</LNodeType>
			<LNodeType id="CSWI_T" lnClass="CSWI">
				<DO name="Pos" type="DPS_T"/>
			</LNodeType>
			<LNodeType id="PTOC_T" lnClass="PTOC">
				<DO name="Op" type="ACT_T"/>
			</LNodeType>
			<LNodeType id="CILO_T" lnClass="CILO">
				<DO name="EnaOpn" type="ENA_T"/>
				<DO name="Mod" type="ENC_T"/>
			</LNodeType>
			<LNodeType id="GGIO_T" lnClass="GGIO">
				<DO name="Ind" type="IND_T"/>
			</LNodeType>
			<LNodeType id="R_LLN0_T" lnClass="LLN0">
				<DO name="Beh" type="R_SPS_T"/>
			</LNodeType>
			<LNodeType id="R_PTRC_T" lnClass="PTRC">
				<DO name="Op" type="R_ACT_T"/>
			</LNodeType>
			<DOType id="SPS_T" cdc="SPS">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="ACT_T" cdc="ACT">
				<DA name="general" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="DPS_T" cdc="DPS">
				<DA name="stVal" bType="Dbpos" fc="ST"/>
			</DOType>
			<DOType id="ENA_T" cdc="SPS">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="ENC_T" cdc="ENC">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="IND_T" cdc="SPS">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="R_SPS_T" cdc="SPS">
				<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			</DOType>
			<DOType id="R_ACT_T" cdc="ACT">
				<DA name="general" bType="BOOLEAN" fc="ST"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>
`

const emptyIsd = /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`

const IED_A: Scl.Ref<'IED'> = { tagName: 'IED', id: 'ied-a' }
const IED_R: Scl.Ref<'IED'> = { tagName: 'IED', id: 'ied-r' }

/** The project as the engineer saved it: P.ssd, so the header can name the file the export came from. */
async function importProject(
	params: Pick<SclTest.ActParams<SclTest.BaseXmlTestCase>, 'project' | 'source' | 'testCase'>,
) {
	const { project, source, testCase } = params
	const { configKey } = await source.query.getDocumentInfo()
	const imported = await project.importFile(
		new File([testCase.sourceXml], 'P.ssd', { type: 'text/xml' }),
		{
			configKey,
			useCustomRecordsIds: true,
		},
	)
	return project.openDocument(imported.documentId)
}

function exportParams(params: { sourceQuery: Scl.Query; iedRef: Scl.Ref<'IED'> }) {
	return {
		...params,
		fileType: 'ISD',
		kind: 'instance',
		// the only input mode available yet; no active case asserts on inputs
		inputs: 'none',
		issuer: 'TEST_ISSUER',
		tool: 'TEST',
		who: 'engineer',
	} as const
}

describe('extract.ied as an ISD of an S-IED', () => {
	const testCases: SclTest.TestCases = {
		'project with S-IED A and real IED R, export of A → the file holds A alone': {
			sourceXml: projectXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL[count(default:IED)=1]/default:IED[@name="A"][@uuid="20000000-0000-4000-8000-00000000000a"]',
			],
			unexpectedQueries: ['//default:IED[@name="R"]', '//default:IED[@name="B"]'],
		},
		'A on N1 shared with B and on N2 → A complete under its name, only its connections, exactly its types':
			{
				sourceXml: projectXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'/default:SCL/default:IED[@name="A"][count(default:AccessPoint)=2]/default:AccessPoint[@name="AP1"][@uuid="30000000-0000-4000-8000-0000000000a1"]/default:Server/default:LDevice[@inst="LD1"][@uuid="40000000-0000-4000-8000-0000000000a1"][count(default:LN0)=1][count(default:LN)=5]',
					'//default:LDevice[@inst="LD1"][default:LN[@lnClass="PTRC"][@lnType="PTRC_T"]][default:LN[@lnClass="RREC"][@lnType="RREC_T"]][default:LN[@lnClass="XCBR"][@lnType="XCBR_T"]][default:LN[@lnClass="CSWI"][@lnType="CSWI_T"]][default:LN[@lnClass="PTOC"][@lnType="PTOC_T"]]',
					'//default:IED[@name="A"]//default:LN0/default:DataSet[@name="DS1"]/default:FCDA[@lnClass="PTRC"][@doName="Op"][@daName="general"]',
					'//default:IED[@name="A"]//default:LN0/default:GSEControl[@name="gcb1"][@datSet="DS1"][@appID="A_gcb1"][@uuid="60000000-0000-4000-8000-0000000000a1"]',
					'/default:SCL/default:Communication[count(default:SubNetwork)=2]/default:SubNetwork[@name="N1"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="A"][@apName="AP1"]/default:Address/default:P[@type="IP"][text()="10.0.1.1"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="N2"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="A"][@apName="AP2"]/default:Address/default:P[@type="IP"][text()="10.0.2.1"]',
					'/default:SCL/default:DataTypeTemplates[count(default:LNodeType)=6][count(default:DOType)=3][count(*)=9]',
					'/default:SCL/default:DataTypeTemplates[default:LNodeType[@id="LLN0_T"]][default:LNodeType[@id="PTRC_T"]][default:LNodeType[@id="RREC_T"]][default:LNodeType[@id="XCBR_T"]][default:LNodeType[@id="CSWI_T"]][default:LNodeType[@id="PTOC_T"]]',
					'/default:SCL/default:DataTypeTemplates[default:DOType[@id="SPS_T"]][default:DOType[@id="ACT_T"]][default:DOType[@id="DPS_T"]]',
				],
				unexpectedQueries: [
					'//default:ConnectedAP[@iedName="B"]',
					'//default:P[text()="10.0.1.2"]',
					'//default:LNodeType[@id="CILO_T" or @id="GGIO_T" or @id="R_LLN0_T" or @id="R_PTRC_T"]',
					'//default:DOType[@id="ENA_T" or @id="ENC_T" or @id="IND_T" or @id="R_SPS_T" or @id="R_ACT_T"]',
				],
			},
		'A exported from P.ssd → the header references P.ssd': {
			sourceXml: projectXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL/default:Header[@fileType="ISD"]/default:SourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="SSD"][@fileName="P" or @fileName="P.ssd"][@fileUuid="10000000-0000-4000-8000-000000000001"][@version="1"][@revision="A"]',
			],
		},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const projectFile = await importProject({ project, source, testCase })
		await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied(
				exportParams({ sourceQuery: projectFile.query, iedRef: IED_A }),
			)
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('an export leaves the project as it was', () => {
	const testCases: SclTest.TestCases = {
		'S-IED A exported → same project content, nothing to undo': {
			sourceXml: projectXml,
			targetXml: emptyIsd,
		},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const projectFile = await importProject({ project, source, testCase })
		const projectBefore = await projectFile.query.getSnapshot({ as: 'tree' })
		await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied(
				exportParams({ sourceQuery: projectFile.query, iedRef: IED_A }),
			)
		})
		const projectAfter = await projectFile.query.getSnapshot({ as: 'tree' })
		expect(projectAfter).toEqual(projectBefore)
		expect(project.state.documents.get(projectFile.documentId)?.canUndo).toBe(false)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('extract.ied refuses a real IED', () => {
	const testCases: SclTest.TestCases = {
		'real IED R, from a supplier ICD → refused, project unchanged, nothing written': {
			sourceXml: projectXml,
			targetXml: emptyIsd,
		},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const projectFile = await importProject({ project, source, testCase })
		const projectBefore = await projectFile.query.getSnapshot({ as: 'tree' })
		const refused = await target
			.transaction(async function exportIsd(tx) {
				return tx.lifecycle.extract.ied(
					exportParams({ sourceQuery: projectFile.query, iedRef: IED_R }),
				)
			})
			.catch((error: unknown) => error)
		expect(toDialecteError(refused)?.key).toBe('IED_NOT_SPECIFICATION')
		const projectAfter = await projectFile.query.getSnapshot({ as: 'tree' })
		expect(projectAfter).toEqual(projectBefore)
		const writtenIeds = await target.query.getRecordsByTagName('IED')
		const writtenHeaders = await target.query.getRecordsByTagName('Header')
		expect(writtenIeds).toHaveLength(0)
		expect(writtenHeaders).toHaveLength(0)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('an exported ISD opened again', () => {
	const testCases: SclTest.TestCases = {
		'ISD of A saved and imported as a file → an ISD holding A, no import finding, no violation': {
			sourceXml: projectXml,
			targetXml: emptyIsd,
		},
	}

	async function act({
		project,
		source,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const projectFile = await importProject({ project, source, testCase })
		await target.transaction(async function exportIsd(tx) {
			return tx.lifecycle.extract.ied(
				exportParams({ sourceQuery: projectFile.query, iedRef: IED_A }),
			)
		})
		const { file } = await project.export({ documentId: target.documentId })
		const xml = await file.text()
		const opened = await project.importFile(new File([xml], 'A.isd', { type: 'text/xml' }))
		expect(opened.diagnostics).toEqual([])
		const document = project.openDocument(opened.documentId)
		const report = await collectSclOutputViolations({ project, document })
		expect(report.violations).toEqual([])
		const [header] = await document.query.getRecordsByTagName('Header')
		const fileType = await document.query.getAttribute(header, { name: 'fileType' })
		expect(fileType).toBe('ISD')
		const ieds = await document.query.getRecordsByTagName('IED')
		expect(ieds).toHaveLength(1)
		const iedName = await document.query.getAttribute(ieds[0], { name: 'name' })
		expect(iedName).toBe('A')
	}

	runSclTestCases.withoutExport({ testCases, act })
})
