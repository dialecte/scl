<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:eIEC61850-6-100="http://www.iec.ch/61850/2019/SCL/6-100" xmlns:eTool="urn:example:tool-labels" version="2007" revision="C" release="5" eIEC61850-6-100:version="2019" eIEC61850-6-100:revision="C" eIEC61850-6-100:release="1">
	<Header id="variant_application" uuid="00000000-0000-4000-8000-000000000300" version="0" revision="1" toolID="twin" fileType="ASD">
		<History>
			<Hitem version="0" revision="1" when="2026-10-23T10:00:00" who="twin" what="first revision"/>
		</History>
	</Header>
	<Substation name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000301">
		<VoltageLevel name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000302">
			<Bay name="TEMPLATE" uuid="00000000-0000-4000-8000-000000000303">
				<Private type="eIEC61850-6-100">
					<eIEC61850-6-100:FunctionCategory name="PROTECTION" uuid="00000000-0000-4000-8000-000000000350">
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Trip conditioning" functionUuid="00000000-0000-4000-8000-000000000321"/>
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Distance zone 1" functionUuid="00000000-0000-4000-8000-000000000322"/>
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Teleprotection" functionUuid="00000000-0000-4000-8000-000000000323"/>
						<eIEC61850-6-100:FunctionCatRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Pole discrepancy" functionUuid="00000000-0000-4000-8000-000000000324"/>
					</eIEC61850-6-100:FunctionCategory>
					<eIEC61850-6-100:Application name="Protection_App" type="Protection" uuid="00000000-0000-4000-8000-000000000310">
						<eIEC61850-6-100:FunctionRole name="APPLICATION ROOT" uuid="00000000-0000-4000-8000-000000000311">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn" functionUuid="00000000-0000-4000-8000-000000000320"/>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionRole name="GENERIC FUNCTION" uuid="00000000-0000-4000-8000-000000000312">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Trip conditioning" functionUuid="00000000-0000-4000-8000-000000000321">
									<eIEC61850-6-100:FunctionalVariantRef functionalVariant="Subtype 01" update="remove"/>
								</eIEC61850-6-100:FunctionRef>
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Distance zone 1" functionUuid="00000000-0000-4000-8000-000000000322">
									<eIEC61850-6-100:FunctionalVariantRef functionalVariant="Subtype 01" update="remove"/>
									<eIEC61850-6-100:FunctionalVariantRef functionalVariant="Subtype 03" update="remove"/>
								</eIEC61850-6-100:FunctionRef>
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Teleprotection" functionUuid="00000000-0000-4000-8000-000000000323">
									<eIEC61850-6-100:FunctionalVariantRef functionalVariant="Subtype 02" update="remove"/>
								</eIEC61850-6-100:FunctionRef>
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Pole discrepancy" functionUuid="00000000-0000-4000-8000-000000000324">
									<eIEC61850-6-100:FunctionalVariantRef functionalVariant="Three pole" update="add"/>
								</eIEC61850-6-100:FunctionRef>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" uuid="00000000-0000-4000-8000-000000000313">
							<eIEC61850-6-100:FunctionRoleContent>
								<eIEC61850-6-100:BehaviorDescriptionRef behaviorDescription="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Alarm logic" behaviorDescriptionUuid="00000000-0000-4000-8000-000000000325"/>
								<eIEC61850-6-100:ProcessResourceRef processResource="TEMPLATE/TEMPLATE/TEMPLATE/Protection_Fn/Teleprotection/Channel" processResourceUuid="00000000-0000-4000-8000-000000000336"/>
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
						<eIEC61850-6-100:FunctionalVariantGroup name="Protection subtype" uuid="00000000-0000-4000-8000-000000000314">
							<eIEC61850-6-100:FunctionalVariant name="Subtype 01" uuid="00000000-0000-4000-8000-000000000315"/>
							<eIEC61850-6-100:FunctionalVariant name="Subtype 02" isBaseline="true" uuid="00000000-0000-4000-8000-000000000316"/>
							<eIEC61850-6-100:FunctionalVariant name="Subtype 03" uuid="00000000-0000-4000-8000-000000000317"/>
						</eIEC61850-6-100:FunctionalVariantGroup>
						<eIEC61850-6-100:FunctionalVariantGroup name="Breaker subtype" uuid="00000000-0000-4000-8000-000000000318">
							<eIEC61850-6-100:FunctionalVariant name="Single pole" isBaseline="true" uuid="00000000-0000-4000-8000-000000000340"/>
							<eIEC61850-6-100:FunctionalVariant name="Three pole" uuid="00000000-0000-4000-8000-000000000341"/>
						</eIEC61850-6-100:FunctionalVariantGroup>
					</eIEC61850-6-100:Application>
				</Private>
				<Function name="Protection_Fn" uuid="00000000-0000-4000-8000-000000000320">
					<Private type="eIEC61850-6-100">
						<eIEC61850-6-100:BehaviorDescription name="Alarm logic" fileReference="00000000-0000-4000-8000-000000000390" format="IEC 61131" uuid="00000000-0000-4000-8000-000000000325">
							<eIEC61850-6-100:InputVar varName="TRIP" dataName="Trip conditioning/PTRC1.Tr.general" lnodeUuid="00000000-0000-4000-8000-000000000333" doName="Tr" daName="general"/>
						</eIEC61850-6-100:BehaviorDescription>
					</Private>
					<SubFunction name="Trip conditioning" uuid="00000000-0000-4000-8000-000000000321">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" lnType="PTRC_Type" uuid="00000000-0000-4000-8000-000000000333">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="PTRC" sLnInst="1"/>
									<eIEC61850-6-100:DOS name="Tr">
										<eIEC61850-6-100:DAS name="general">
											<eIEC61850-6-100:Labels>
												<Private type="eTool">
													<eTool:LabelInfo name="Object_1" LabelId="Object_1"/>
												</Private>
												<Label id="Object_1" lang="EN">Trip</Label>
											</eIEC61850-6-100:Labels>
										</eIEC61850-6-100:DAS>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
					</SubFunction>
					<SubFunction name="Distance zone 1" uuid="00000000-0000-4000-8000-000000000322">
							<LNode iedName="None" lnClass="PDIS" lnInst="1" uuid="00000000-0000-4000-8000-000000000334"/>
					</SubFunction>
					<SubFunction name="Teleprotection" uuid="00000000-0000-4000-8000-000000000323">
						<Private type="eIEC61850-6-100">
							<eIEC61850-6-100:ProcessResources>
								<eIEC61850-6-100:ProcessResource name="Channel" uuid="00000000-0000-4000-8000-000000000336"/>
							</eIEC61850-6-100:ProcessResources>
						</Private>
							<LNode iedName="None" lnClass="PSCH" lnInst="1" uuid="00000000-0000-4000-8000-000000000335"/>
					</SubFunction>
					<SubFunction name="Pole discrepancy" uuid="00000000-0000-4000-8000-000000000324">
							<LNode iedName="None" lnClass="RPLD" lnInst="1" uuid="00000000-0000-4000-8000-000000000337"/>
					</SubFunction>
				</Function>
			</Bay>
		</VoltageLevel>
	</Substation>
	<DataTypeTemplates>
		<LNodeType id="PTRC_Type" lnClass="PTRC">
			<DO name="Tr" type="ACT_Type"/>
		</LNodeType>
		<DOType id="ACT_Type" cdc="ACT">
			<DA name="general" bType="BOOLEAN" fc="ST"/>
		</DOType>
	</DataTypeTemplates>
</SCL>
