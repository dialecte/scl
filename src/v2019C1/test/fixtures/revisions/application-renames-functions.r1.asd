<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100" version="2007" revision="C" release="5" eIEC61850-6-100:version="2019" eIEC61850-6-100:revision="C" eIEC61850-6-100:release="1">
	<Header id="breaker_application" uuid="00000000-0000-4000-8000-000000000100" version="1" revision="1" toolID="twin" fileType="ASD">
		<History>
			<Hitem version="1" revision="1" when="2026-09-28T10:00:00" who="twin" what="first revision"/>
		</History>
	</Header>
	<Substation name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000101">
		<Private type="eIEC61850-6-100">
			<eIEC61850-6-100:FunctionCategory name="INTERFACE" uuid="00000000-0000-4000-8000-000000000104" templateUuid="00000000-0000-4000-8000-000000000105">
				<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Breaker_Fn/Output conditioner" functionUuid="00000000-0000-4000-8000-000000000122"/>
			</eIEC61850-6-100:FunctionCategory>
		</Private>
		<VoltageLevel name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000102">
			<Bay name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000103">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:Application name="Breaker_App" type="Protection" uuid="00000000-0000-4000-8000-000000000110">
						<eIEC61850-6-100:FunctionRole name="ROOT" uuid="00000000-0000-4000-8000-000000000111">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Breaker_Fn" functionUuid="00000000-0000-4000-8000-000000000120"/>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionRole name="INTERFACE" uuid="00000000-0000-4000-8000-000000000112">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:FunctionRef functionUuid="00000000-0000-4000-8000-000000000122">
									<eIEC61850-6-100:SignalRole name="Input" uuid="00000000-0000-4000-8000-000000000113">
										<eIEC61850-6-100:LNodeInputRef sourceRef="TEMPLATE/TEMPLATE/TEMPLATE/Breaker_Fn/Output conditioner/LCBO1.OpnCmd1.stVal" sourceRefUuid="00000000-0000-4000-8000-000000000140"/>
									</eIEC61850-6-100:SignalRole>
								</eIEC61850-6-100:FunctionRef>
								<eIEC61850-6-100:FunctionCategoryRef functionCategoryUuid="00000000-0000-4000-8000-000000000104"/>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/TEMPLATE/TEMPLATE/PIU" allocationRoleUuid="00000000-0000-4000-8000-000000000114"/>
					</eIEC61850-6-100:Application>
					<eIEC61850-6-100:AllocationRole name="PIU" uuid="00000000-0000-4000-8000-000000000114">
						<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Breaker_Fn/Output conditioner" functionUuid="00000000-0000-4000-8000-000000000122"/>
						<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Breaker_Fn/Digital output" functionUuid="00000000-0000-4000-8000-000000000123"/>
					</eIEC61850-6-100:AllocationRole>
				</Private>
				<Function name="Breaker_Fn" uuid="00000000-0000-4000-8000-000000000120">
					<SubFunction name="Circuit breaker" uuid="00000000-0000-4000-8000-000000000121" templateUuid="00000000-0000-4000-8000-000000000125">
						<Private type="eIEC61850-6-100"><eIEC61850-6-100:FunctionSclRef><eIEC61850-6-100:SclFileReference fileName="breaker" fileType="FSD" fileUuid="00000000-0000-4000-8000-000000000150" version="2" revision="2"/></eIEC61850-6-100:FunctionSclRef></Private>
						<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="XCBR_T" uuid="00000000-0000-4000-8000-000000000130" templateUuid="00000000-0000-4000-8000-000000000134">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="XCBR" sLnInst="1"/>
						</Private>
						</LNode>
					</SubFunction>
					<SubFunction name="Output conditioner" uuid="00000000-0000-4000-8000-000000000122" templateUuid="00000000-0000-4000-8000-000000000126">
						<Private type="eIEC61850-6-100"><eIEC61850-6-100:FunctionSclRef><eIEC61850-6-100:SclFileReference fileName="conditioner" fileType="FSD" fileUuid="00000000-0000-4000-8000-000000000151" version="0" revision="1"/></eIEC61850-6-100:FunctionSclRef></Private>
						<LNode iedName="None" lnClass="LCBO" lnInst="1" lnType="LCBO_T" uuid="00000000-0000-4000-8000-000000000131" templateUuid="00000000-0000-4000-8000-000000000135">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="LCBO" sLnInst="1"/>
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="OpnCmd1" inputInst="1" pLN="XCBR" pDO="OpnCmd1" pDA="stVal" service="GOOSE" source="TEMPLATE/TEMPLATE/TEMPLATE/Breaker_Fn/Circuit breaker/XCBR1.OpnCmd1.stVal" sourceLNodeUuid="00000000-0000-4000-8000-000000000130" sourceDoName="OpnCmd1" sourceDaName="stVal" uuid="00000000-0000-4000-8000-000000000140"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</SubFunction>
					<SubFunction name="Digital output" uuid="00000000-0000-4000-8000-000000000123" templateUuid="00000000-0000-4000-8000-000000000127">
						<Private type="eIEC61850-6-100"><eIEC61850-6-100:FunctionSclRef><eIEC61850-6-100:SclFileReference fileName="output" fileType="FSD" fileUuid="00000000-0000-4000-8000-000000000152" version="1" revision="1"/></eIEC61850-6-100:FunctionSclRef></Private>
						<LNode iedName="None" lnClass="LPDO" lnInst="1" lnType="LPDO_T" uuid="00000000-0000-4000-8000-000000000132" templateUuid="00000000-0000-4000-8000-000000000136">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="LPDO" sLnInst="1"/>
								<eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:SourceRef input="OutInd" inputInst="1" pLN="LCBO" pDO="OutInd" pDA="stVal" service="Internal" source="TEMPLATE/TEMPLATE/TEMPLATE/Breaker_Fn/Output conditioner/LCBO1.OutInd.stVal" sourceLNodeUuid="00000000-0000-4000-8000-000000000131" sourceDoName="OutInd" sourceDaName="stVal" uuid="00000000-0000-4000-8000-000000000141"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</SubFunction>
					<SubFunction name="Device logical node" uuid="00000000-0000-4000-8000-000000000124" templateUuid="00000000-0000-4000-8000-000000000128">
						<Private type="eIEC61850-6-100"><eIEC61850-6-100:FunctionSclRef><eIEC61850-6-100:SclFileReference fileName="device" fileType="FSD" fileUuid="00000000-0000-4000-8000-000000000153" version="1" revision="1"/></eIEC61850-6-100:FunctionSclRef></Private>
						<LNode iedName="None" lnClass="LLN0" lnType="LLN0_T" uuid="00000000-0000-4000-8000-000000000133" templateUuid="00000000-0000-4000-8000-000000000137">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="LLN0"/>
							</Private>
						</LNode>
					</SubFunction>
				</Function>
			</Bay>
		</VoltageLevel>
	</Substation>
	<DataTypeTemplates>
		<LNodeType id="XCBR_T" lnClass="XCBR">
			<DO name="OpnCmd1" type="SPS_T"/>
		</LNodeType>
		<LNodeType id="LCBO_T" lnClass="LCBO">
			<DO name="OutInd" type="SPS_T"/>
		</LNodeType>
		<LNodeType id="LPDO_T" lnClass="LPDO">
			<DO name="OutInd" type="SPS_T"/>
		</LNodeType>
		<LNodeType id="LLN0_T" lnClass="LLN0">
			<DO name="Beh" type="SPS_T"/>
		</LNodeType>
		<DOType id="SPS_T" cdc="SPS">
			<DA name="stVal" bType="BOOLEAN" fc="ST"/>
			<DA name="q" bType="Quality" fc="ST"/>
		</DOType>
	</DataTypeTemplates>
</SCL>
