import { getResolutionType, parseLnodePath, parseReferencePath } from './parse-path'

import { describe, it, expect } from 'vitest'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/extensions/reference/constants'
import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { ResolutionType } from '@/v2019C1/extensions/reference/constants'
import type { SclTest } from '@/v2019C1/test'

// ── Integration tests: path resolution through XML import ────────────

describe('reference-parsing', () => {
	describe('direct strategy', () => {
		const testCases: SclTest.TestCases = {
			'FunctionCatRef with path to existing Function → functionUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Function name="Protection" uuid="func-prot-uuid" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="Cat1">
									<eIEC61850-6-100:FunctionCatRef function="S1/Protection" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:FunctionCatRef[@function="S1/Protection" and @functionUuid="func-prot-uuid"]',
				],
			},
			'FunctionRef with path to nested SubFunction → functionUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<VoltageLevel name="V1">
								<Function name="Prot">
									<SubFunction name="Trip" uuid="sf-trip-uuid" />
								</Function>
							</VoltageLevel>
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:AllocationRole name="AR1">
									<eIEC61850-6-100:FunctionRoleContent>
										<eIEC61850-6-100:FunctionRef function="S1/V1/Prot/Trip" />
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:AllocationRole>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:FunctionRef[@function="S1/V1/Prot/Trip" and @functionUuid="sf-trip-uuid"]',
				],
			},
			'ProcessResourceRef with path to ProcessResource → processResourceUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:ProcessResources>
										<eIEC61850-6-100:ProcessResource name="PR1" uuid="pr-uuid" />
									</eIEC61850-6-100:ProcessResources>
								</Private>
								<LNode lnClass="XCBR" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef input="Trip" resourceName="S1/B1/PR1">
												<eIEC61850-6-100:ProcessResourceRef processResource="S1/B1/PR1" />
											</eIEC61850-6-100:SourceRef>
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:ProcessResourceRef[@processResource="S1/B1/PR1" and @processResourceUuid="pr-uuid"]',
				],
			},
			'FunctionCatRef with path to non-existent element → functionUuid absent': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Function name="Existing" uuid="func-uuid" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="Cat1">
									<eIEC61850-6-100:FunctionCatRef function="S1/NonExistent" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/NonExistent"]'],
				unexpectedQueries: [
					'//v2019C1:FunctionCatRef[@function="S1/NonExistent" and @functionUuid]',
				],
			},
			'FunctionCatRef with functionUuid already present → existing value preserved': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Function name="Protection" uuid="func-prot-uuid" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="Cat1">
									<eIEC61850-6-100:FunctionCatRef function="S1/Protection" functionUuid="already-set" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:FunctionCatRef[@function="S1/Protection" and @functionUuid="already-set"]',
				],
			},
			'FunctionCatRef with target lacking uuid → uuid auto-generated and functionUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Function name="F2" />
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:FunctionCategory name="Cat">
									<eIEC61850-6-100:FunctionCatRef function="S1/F2" />
								</eIEC61850-6-100:FunctionCategory>
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/F2" and @functionUuid]'],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async () => ({ assertOn: 'source' }),
		})
	})

	describe('lnode strategy', () => {
		const testCases: SclTest.TestCases = {
			'SourceRef.source with DO.DA qualifier → sourceLNodeUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode prefix="P" lnClass="XCBR" lnInst="1" uuid="ln-pxcbr-uuid" />
								<LNode lnClass="PTRC" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef input="Trip" source="S1/B1/PXCBR1.Pos.stVal" sourceDoName="Pos" sourceDaName="stVal" />
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/B1/PXCBR1.Pos.stVal" and @sourceLNodeUuid="ln-pxcbr-uuid"]',
				],
			},
			'SourceRef.source without qualifier → sourceLNodeUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1" uuid="ln-xcbr-uuid" />
								<LNode lnClass="PTRC" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef input="Trip" source="S1/B1/XCBR1" sourceDoName="Pos" />
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/B1/XCBR1" and @sourceLNodeUuid="ln-xcbr-uuid"]',
				],
			},
			'ControlRef.controlled with DO qualifier → controlledLNodeUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="PTRC" lnInst="1" uuid="ln-ptrc-uuid" />
								<LNode lnClass="XCBR" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeOutputs>
											<eIEC61850-6-100:ControlRef output="TripCmd" controlled="S1/B1/PTRC1.Tr" controlledDoName="Tr" />
										</eIEC61850-6-100:LNodeOutputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:ControlRef[@controlled="S1/B1/PTRC1.Tr" and @controlledLNodeUuid="ln-ptrc-uuid"]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async () => ({ assertOn: 'source' }),
		})
	})

	describe('IEC 7-2 ObjectReference (lnode strategy)', () => {
		const testCases: SclTest.TestCases = {
			'DOS.mappedDoName referencing IED LN → mappedLnUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeSpecNaming sIedName="IED1" sLdInst="LD1" sLnClass="XCBR" sLnInst="1" sPrefix="" />
										<eIEC61850-6-100:DOS name="Pos" mappedDoName="IED1/LD1/XCBR1.Pos" />
									</Private>
								</LNode>
							</Bay>
						</Substation>
						<IED name="IED1">
							<AccessPoint name="AP1">
								<Server>
									<LDevice inst="LD1">
										<LN0 lnClass="LLN0" inst="" />
										<LN prefix="" lnClass="XCBR" inst="1" uuid="ied-xcbr-uuid" />
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:DOS[@mappedDoName="IED1/LD1/XCBR1.Pos" and @mappedLnUuid="ied-xcbr-uuid"]',
				],
			},
			'DAS.mappedDaName referencing IED LN → mappedLnUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:DOS name="Pos">
											<eIEC61850-6-100:DAS name="stVal" mappedDaName="IED1/LD1/XCBR1.Pos.stVal" />
										</eIEC61850-6-100:DOS>
									</Private>
								</LNode>
							</Bay>
						</Substation>
						<IED name="IED1">
							<AccessPoint name="AP1">
								<Server>
									<LDevice inst="LD1">
										<LN prefix="" lnClass="XCBR" inst="1" uuid="ied-xcbr-uuid" />
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:DAS[@mappedDaName="IED1/LD1/XCBR1.Pos.stVal" and @mappedLnUuid="ied-xcbr-uuid"]',
				],
			},
			'DOS.mappedDoName through transparent AccessPoint → mappedLnUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="MMXU" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:DOS name="A" mappedDoName="PIU/CT_Function/I01ATCTR1.AmpSv" />
									</Private>
								</LNode>
							</Bay>
						</Substation>
						<IED name="PIU">
							<AccessPoint name="AP1">
								<Server>
									<LDevice inst="CT_Function">
										<LN prefix="I01A" lnClass="TCTR" inst="1" uuid="tctr-uuid" />
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:DOS[@mappedDoName="PIU/CT_Function/I01ATCTR1.AmpSv" and @mappedLnUuid="tctr-uuid"]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async () => ({ assertOn: 'source' }),
		})
	})

	describe('ied-address strategy', () => {
		const testCases: SclTest.TestCases = {
			'SourceRef.extRefAddr with absolute IED path → extRefUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="LCBO" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef input="Trip" extRefAddr="PIU/CB_Function/LCBO1.TrCmd.stVal" />
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
						<IED name="PIU">
							<AccessPoint name="AP1">
								<Server>
									<LDevice inst="CB_Function">
										<LN prefix="" lnClass="LCBO" inst="1">
											<Inputs>
												<ExtRef intAddr="TrCmd.stVal" uuid="extref-trcmd-uuid" />
											</Inputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:SourceRef[@extRefAddr="PIU/CB_Function/LCBO1.TrCmd.stVal" and @extRefUuid="extref-trcmd-uuid"]',
				],
			},
			'ControlRef.extCtrlAddr with absolute IED path → extCtrlUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeOutputs>
											<eIEC61850-6-100:ControlRef output="TripCmd" extCtrlAddr="IED1/LD1/XCBR1.Pos" />
										</eIEC61850-6-100:LNodeOutputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
						<IED name="IED1">
							<AccessPoint name="AP1">
								<Server>
									<LDevice inst="LD1">
										<LN prefix="" lnClass="XCBR" inst="1">
											<Inputs>
												<ExtCtrl intAddr="Pos" uuid="extctrl-pos-uuid" />
											</Inputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:ControlRef[@extCtrlAddr="IED1/LD1/XCBR1.Pos" and @extCtrlUuid="extctrl-pos-uuid"]',
				],
			},
			'ControlRef.extCtrlAddr with IED-relative path, iedName on parent LNode → extCtrlUuid populated via fallback':
				{
					sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES}>
					<Substation name="S1">
						<Bay name="B1">
							<LNode iedName="IED1" ldInst="LD1" lnClass="XCBR" lnInst="1">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeOutputs>
										<eIEC61850-6-100:ControlRef output="TripCmd" extCtrlAddr="LD1/XCBR1.Pos" />
									</eIEC61850-6-100:LNodeOutputs>
								</Private>
							</LNode>
						</Bay>
					</Substation>
					<IED name="IED1">
						<AccessPoint name="AP1">
							<Server>
								<LDevice inst="LD1">
									<LN prefix="" lnClass="XCBR" inst="1">
										<Inputs>
											<ExtCtrl intAddr="Pos" uuid="extctrl-pos-uuid" />
										</Inputs>
									</LN>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
					expectedQueries: [
						'//v2019C1:ControlRef[@extCtrlAddr="LD1/XCBR1.Pos" and @extCtrlUuid="extctrl-pos-uuid"]',
					],
				},
			'SourceRef.extRefAddr with IED-relative path, iedName on parent LNode → extRefUuid populated via fallback':
				{
					sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode iedName="PIU" ldInst="CB_Function" lnClass="LCBO" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef input="Trip" extRefAddr="CB_Function/LCBO1.TrCmd.stVal" />
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
						<IED name="PIU">
							<AccessPoint name="AP1">
								<Server>
									<LDevice inst="CB_Function">
										<LN prefix="" lnClass="LCBO" inst="1">
											<Inputs>
												<ExtRef intAddr="TrCmd.stVal" uuid="extref-trcmd-uuid" />
											</Inputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
					expectedQueries: [
						'//v2019C1:SourceRef[@extRefAddr="CB_Function/LCBO1.TrCmd.stVal" and @extRefUuid="extref-trcmd-uuid"]',
					],
				},
		}

		runSclTestCases.withExport({
			testCases,
			act: async () => ({ assertOn: 'source' }),
		})
	})

	describe('behavior-description strategy', () => {
		const testCases: SclTest.TestCases = {
			'InputVar.dataName inside BehaviorDescription → lnodeUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1" uuid="ln-xcbr-uuid">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:BehaviorDescription name="BD1">
											<eIEC61850-6-100:InputVar dataName="Op.general" />
										</eIEC61850-6-100:BehaviorDescription>
									</Private>
								</LNode>
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:InputVar[@dataName="Op.general" and @lnodeUuid="ln-xcbr-uuid"]',
				],
			},
			'InputVar.inputName matching SourceRef → inputUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1" uuid="ln-xcbr-uuid">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef input="Trip" inputInst="1" uuid="srcref-trip-uuid" source="S1/B1/PTRC1.Tr.general" sourceDoName="Tr" sourceDaName="general" />
										</eIEC61850-6-100:LNodeInputs>
										<eIEC61850-6-100:BehaviorDescription name="BD1">
											<eIEC61850-6-100:InputVar dataName="Op.general" inputName="Trip" />
										</eIEC61850-6-100:BehaviorDescription>
									</Private>
								</LNode>
								<LNode lnClass="PTRC" lnInst="1" uuid="ln-ptrc-uuid" />
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:InputVar[@inputName="Trip" and @inputUuid="srcref-trip-uuid"]',
				],
			},
			'OutputVar.outputName matching ControlRef → outputUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1" uuid="ln-xcbr-uuid">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeOutputs>
											<eIEC61850-6-100:ControlRef output="TripCmd" outputInst="1" uuid="ctrlref-tripcmd-uuid" controlled="S1/B1/PTRC1.Tr" controlledDoName="Tr" />
										</eIEC61850-6-100:LNodeOutputs>
										<eIEC61850-6-100:BehaviorDescription name="BD1">
											<eIEC61850-6-100:OutputVar dataName="Pos.stVal" outputName="TripCmd" />
										</eIEC61850-6-100:BehaviorDescription>
									</Private>
								</LNode>
								<LNode lnClass="PTRC" lnInst="1" uuid="ln-ptrc-uuid" />
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:OutputVar[@outputName="TripCmd" and @outputUuid="ctrlref-tripcmd-uuid"]',
				],
			},
			'OutputVar.dataName inside BehaviorDescription → lnodeUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<LNode lnClass="XCBR" lnInst="1" uuid="ln-xcbr-uuid">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:BehaviorDescription name="BD1">
											<eIEC61850-6-100:OutputVar dataName="Pos.stVal" />
										</eIEC61850-6-100:BehaviorDescription>
									</Private>
								</LNode>
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:OutputVar[@dataName="Pos.stVal" and @lnodeUuid="ln-xcbr-uuid"]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async () => ({ assertOn: 'source' }),
		})
	})

	describe('multiple reference pairs on a single element', () => {
		const testCases: SclTest.TestCases = {
			'SourceRef with source and resourceName → both sourceLNodeUuid and resourceUuid populated': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Bay name="B1">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:ProcessResources>
										<eIEC61850-6-100:ProcessResource name="PR1" uuid="pr-uuid" />
									</eIEC61850-6-100:ProcessResources>
								</Private>
								<LNode lnClass="XCBR" lnInst="1" uuid="ln-xcbr-uuid" />
								<LNode lnClass="PTRC" lnInst="1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:LNodeInputs>
											<eIEC61850-6-100:SourceRef input="Trip" source="S1/B1/XCBR1.Pos" sourceDoName="Pos" resourceName="S1/B1/PR1" />
										</eIEC61850-6-100:LNodeInputs>
									</Private>
								</LNode>
							</Bay>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/B1/XCBR1.Pos" and @sourceLNodeUuid="ln-xcbr-uuid" and @resourceUuid="pr-uuid"]',
				],
			},
			'multiple different reference elements targeting same ProcessResource → all resolved': {
				sourceXml: /* xml */ `
					<SCL ${ALL_XMLNS_NAMESPACES}>
						<Substation name="S1">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:ProcessResources>
									<eIEC61850-6-100:ProcessResource name="PR1" uuid="pr-uuid" />
								</eIEC61850-6-100:ProcessResources>
								<eIEC61850-6-100:ProcessResourceRef processResource="S1/PR1" />
								<eIEC61850-6-100:ControllingLNode resourceName="S1/PR1" outputName="" />
							</Private>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:ProcessResourceRef[@processResource="S1/PR1" and @processResourceUuid="pr-uuid"]',
					'//v2019C1:ControllingLNode[@resourceName="S1/PR1" and @resourceUuid="pr-uuid"]',
				],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async () => ({ assertOn: 'source' }),
		})
	})

	// ── Pure unit tests for parsing functions ────────────────────────

	describe('parseLnodePath', () => {
		type TestCase = {
			input: string
			expected: { lookupKey: string; qualifier?: string }
		}

		const testCases: Record<string, TestCase> = {
			'path with DO.DA qualifier → lookupKey before dot, qualifier after': {
				input: 'S1/V1/B1/PXCBR1.Pos.stVal',
				expected: { lookupKey: 'S1/V1/B1/PXCBR1', qualifier: 'Pos.stVal' },
			},
			'path with DO qualifier only → lookupKey before dot, qualifier after': {
				input: 'S1/V1/B1/PXCBR1.Pos',
				expected: { lookupKey: 'S1/V1/B1/PXCBR1', qualifier: 'Pos' },
			},
			'path without qualifier → lookupKey equals full path': {
				input: 'S1/V1/B1/PXCBR1',
				expected: { lookupKey: 'S1/V1/B1/PXCBR1' },
			},
			'path with deep DO chain → lookupKey strips all after first dot': {
				input: 'S1/B1/MMXU1.PhV.phsA.cVal.mag.f',
				expected: { lookupKey: 'S1/B1/MMXU1', qualifier: 'PhV.phsA.cVal.mag.f' },
			},
		}

		Object.entries(testCases).forEach(([description, tc]) => {
			it(description, () => {
				expect(parseLnodePath(tc.input)).toEqual(tc.expected)
			})
		})
	})

	describe('parseReferencePath', () => {
		type TestCase = {
			element: string
			attribute: string
			value: string
			expected: { lookupKey: string; qualifier?: string } | null
		}

		const testCases: Record<string, TestCase> = {
			'FunctionRef.function (direct) → lookupKey equals path': {
				element: 'FunctionRef',
				attribute: 'function',
				value: 'S1/V1/Protection',
				expected: { lookupKey: 'S1/V1/Protection' },
			},
			'SourceRef.source (lnode) → lookupKey strips qualifier': {
				element: 'SourceRef',
				attribute: 'source',
				value: 'S1/B1/PXCBR1.Pos.stVal',
				expected: { lookupKey: 'S1/B1/PXCBR1', qualifier: 'Pos.stVal' },
			},
			'DOS.mappedDoName (lnode) → lookupKey strips qualifier': {
				element: 'DOS',
				attribute: 'mappedDoName',
				value: 'IED1/LD0/XCBR1.Pos',
				expected: { lookupKey: 'IED1/LD0/XCBR1', qualifier: 'Pos' },
			},
			'SourceRef.extRefAddr (ied-address) → lookupKey equals path': {
				element: 'SourceRef',
				attribute: 'extRefAddr',
				value: 'PIU/CB_Function/LCBO1.TrCmd.stVal',
				expected: { lookupKey: 'PIU/CB_Function/LCBO1.TrCmd.stVal' },
			},
			'InputVar.dataName (behavior-description) without ancestry → null': {
				element: 'InputVar',
				attribute: 'dataName',
				value: 'Op.general',
				expected: null,
			},
			'unknown element → null': {
				element: 'Unknown',
				attribute: 'foo',
				value: 'bar',
				expected: null,
			},
		}

		Object.entries(testCases).forEach(([description, tc]) => {
			it(description, () => {
				const resolution = getResolutionType(tc.element, tc.attribute)
				if (!resolution) {
					expect(tc.expected).toBeNull()
					return
				}
				expect(parseReferencePath(resolution, tc.attribute, tc.value)).toEqual(tc.expected)
			})
		})
	})

	describe('getResolutionType', () => {
		type TestCase = {
			element: string
			attribute: string
			expected: ResolutionType | null
		}

		const testCases: Record<string, TestCase> = {
			'FunctionRef.function → direct': {
				element: 'FunctionRef',
				attribute: 'function',
				expected: 'direct',
			},
			'SourceRef.source → lnode': {
				element: 'SourceRef',
				attribute: 'source',
				expected: 'lnode',
			},
			'SourceRef.extRefAddr → ied-address': {
				element: 'SourceRef',
				attribute: 'extRefAddr',
				expected: 'ied-address',
			},
			'DOS.mappedDoName → lnode': {
				element: 'DOS',
				attribute: 'mappedDoName',
				expected: 'lnode',
			},
			'InputVar.dataName → behavior-description': {
				element: 'InputVar',
				attribute: 'dataName',
				expected: 'behavior-description',
			},
			'unknown element → null': {
				element: 'Unknown',
				attribute: 'foo',
				expected: null,
			},
			'known element, unknown attribute → null': {
				element: 'FunctionRef',
				attribute: 'unknown',
				expected: null,
			},
		}

		Object.entries(testCases).forEach(([description, tc]) => {
			it(description, () => {
				expect(getResolutionType(tc.element, tc.attribute)).toBe(tc.expected)
			})
		})
	})

	describe('UUID_REFERENCE_PAIRS resolution coverage', () => {
		it('every (element, pathAttribute) pair has a resolution field', () => {
			const missing: string[] = []

			for (const [elementTag, pairs] of Object.entries(UUID_REFERENCE_PAIRS)) {
				for (const pair of pairs) {
					const resolution = getResolutionType(elementTag, pair.attribute.path)
					if (resolution === null) {
						missing.push(`${elementTag}.${pair.attribute.path}`)
					}
				}
			}

			expect(missing).toEqual([])
		})
	})
})
