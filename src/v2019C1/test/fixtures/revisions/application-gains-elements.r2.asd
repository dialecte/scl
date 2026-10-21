<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100" version="2007" revision="C" release="5" eIEC61850-6-100:version="2019" eIEC61850-6-100:revision="C" eIEC61850-6-100:release="1">
	<Header id="overcurrent_application" uuid="00000000-0000-4000-8000-000000000200" version="0" revision="2" toolID="twin" fileType="ASD">
		<History>
			<Hitem version="0" revision="1" when="2026-09-28T10:00:00" who="twin" what="first revision"/>
			<Hitem version="0" revision="2" when="2026-09-30T10:00:00" who="twin" what="second revision"/>
		</History>
	</Header>
	<Substation name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000201">
		<VoltageLevel name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000202">
			<Bay name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000203">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:Application name="Overcurrent_App" type="Protection" uuid="00000000-0000-4000-8000-000000000210">
						<eIEC61850-6-100:FunctionRole name="ROOT" uuid="00000000-0000-4000-8000-000000000211">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Overcurrent_Fn" functionUuid="00000000-0000-4000-8000-000000000220"/>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionRole name="PROTECTION" uuid="00000000-0000-4000-8000-000000000212">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:FunctionRef functionUuid="00000000-0000-4000-8000-000000000221">
									<eIEC61850-6-100:SignalRole name="Internal" uuid="00000000-0000-4000-8000-000000000213">
										<eIEC61850-6-100:LNodeDataRef data="TEMPLATE/TEMPLATE/TEMPLATE/Overcurrent_Fn/Time overcurrent/PTOC1.Op.general" lnodeUuid="00000000-0000-4000-8000-000000000230" doName="Op" daName="general"/>
									</eIEC61850-6-100:SignalRole>
								</eIEC61850-6-100:FunctionRef>
								<eIEC61850-6-100:FunctionRef functionUuid="00000000-0000-4000-8000-000000000222">
									<eIEC61850-6-100:SignalRole name="Process" uuid="00000000-0000-4000-8000-000000000214">
										<eIEC61850-6-100:LNodeDataRef data="TEMPLATE/TEMPLATE/TEMPLATE/Overcurrent_Fn/Trip conditioning/PTRC1.Tr.general" lnodeUuid="00000000-0000-4000-8000-000000000231" doName="Tr" daName="general"/>
									</eIEC61850-6-100:SignalRole>
								</eIEC61850-6-100:FunctionRef>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" uuid="00000000-0000-4000-8000-000000000215">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="TEMPLATE/TEMPLATE/TEMPLATE/Overcurrent_Fn/TRIP_LOGIC" behaviorDescriptionUuid="00000000-0000-4000-8000-000000000216"/>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
					</eIEC61850-6-100:Application>
				</Private>
				<Function name="Overcurrent_Fn" uuid="00000000-0000-4000-8000-000000000220">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:BehaviorDescription name="TRIP_LOGIC" format="IEC 61131" isSimulation="true" isSpecification="true" uuid="00000000-0000-4000-8000-000000000216">
							<eIEC61850-6-100:InputVar varName="Op_general" dataName="Time overcurrent/PTOC1.Op.general" lnodeUuid="00000000-0000-4000-8000-000000000230" doName="Op" daName="general"/>
							<eIEC61850-6-100:OutputVar varName="Tr_general" dataName="Trip conditioning/PTRC1.Tr.general" lnodeUuid="00000000-0000-4000-8000-000000000231" doName="Tr" daName="general"/>
						</eIEC61850-6-100:BehaviorDescription>
					</Private>
					<SubFunction name="Time overcurrent" uuid="00000000-0000-4000-8000-000000000221" templateUuid="00000000-0000-4000-8000-000000000223">
						<Private type="eIEC61850-6-100"><eIEC61850-6-100:FunctionSclRef><eIEC61850-6-100:SclFileReference fileName="time-overcurrent" fileType="FSD" fileUuid="00000000-0000-4000-8000-000000000240" version="0" revision="1"/></eIEC61850-6-100:FunctionSclRef></Private>
						<LNode iedName="None" lnClass="PTOC" lnInst="1" lnType="PTOC_T" uuid="00000000-0000-4000-8000-000000000230" templateUuid="00000000-0000-4000-8000-000000000232">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="PTOC" sLnInst="1"/>
							</Private>
						</LNode>
					</SubFunction>
					<SubFunction name="Trip conditioning" uuid="00000000-0000-4000-8000-000000000222" templateUuid="00000000-0000-4000-8000-000000000224">
						<Private type="eIEC61850-6-100"><eIEC61850-6-100:FunctionSclRef><eIEC61850-6-100:SclFileReference fileName="trip-conditioning" fileType="FSD" fileUuid="00000000-0000-4000-8000-000000000241" version="0" revision="1"/></eIEC61850-6-100:FunctionSclRef></Private>
						<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_T" uuid="00000000-0000-4000-8000-000000000231" templateUuid="00000000-0000-4000-8000-000000000233">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="PTRC" sLnInst="1"/>
							</Private>
						</LNode>
					</SubFunction>
				</Function>
			</Bay>
		</VoltageLevel>
	</Substation>
	<DataTypeTemplates>
		<LNodeType id="PTOC_T" lnClass="PTOC">
			<DO name="Op" type="ACT_T"/>
		</LNodeType>
		<LNodeType id="PTRC_T" lnClass="PTRC">
			<DO name="Tr" type="ACT_T"/>
		</LNodeType>
		<DOType id="ACT_T" cdc="ACT">
			<DA name="general" bType="BOOLEAN" fc="ST"/>
			<DA name="q" bType="Quality" fc="ST"/>
		</DOType>
	</DataTypeTemplates>
</SCL>
