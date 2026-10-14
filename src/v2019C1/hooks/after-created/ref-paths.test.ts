import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1'
import type { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * Contract: a reference created with its uuid only gets its path written, so a reader of the
 * path (another tool) and a reader of the uuid see the same target.
 *
 * One row per reference pair whose path form is settled. Not in this table:
 * - `DOS` / `SDS` / `DAS` `mappedDoName` / `mappedDaName`: stored in the mapped-data canonical
 *   form, see `reconcile-mapped-data.test.ts`.
 * - `VariableApplyTo.element`: an XPath selector, never rebuilt as a name path.
 * - `LNodeInputRef.sourceRef`, `LNodeOutputRef.controlRef`, `LNodeDataRef.data`: relative to
 *   their Function, see `extensions/reference/query/build/function-scoped-paths.test.ts`.
 */
describe('setRefPaths', () => {
	describe('referrer created with its uuid only', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			parent: Scl.Ref<Scl.ElementsOf>
			referrer: { tagName: keyof typeof UUID_REFERENCE_PAIRS; attributes: Record<string, string> }
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'FunctionCatRef with functionUuid → function path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" uuid="00000000-0000-4000-8000-000000000001" ${id}="target"/>
							<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="parent"/>
							<!-- FunctionCatRef created by act -->
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionCategory', id: 'parent' },
				referrer: {
					tagName: 'FunctionCatRef',
					attributes: { functionUuid: '00000000-0000-4000-8000-000000000001' },
				},
				expectedQueries: [
					'//v2019C1:FunctionCatRef[@functionUuid="00000000-0000-4000-8000-000000000001" and @function="S1/F1"]',
				],
			},

			// ── direct: the path is the target's element path ───────────────────

			'AllocationRoleRef with allocationRoleUuid → allocationRole path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<eIEC61850-6-100:AllocationRole name="AR1" uuid="uuid-target" ${id}="target"/>
							<eIEC61850-6-100:Application name="A1" ${id}="parent"/>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'Application', id: 'parent' },
				referrer: {
					tagName: 'AllocationRoleRef',
					attributes: { allocationRoleUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:AllocationRoleRef[@allocationRoleUuid="uuid-target" and @allocationRole="S1/AR1"]',
				],
			},
			'BehaviorDescriptionRef with behaviorDescriptionUuid → behaviorDescription path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="uuid-target" ${id}="target"/>
							</Function>
							<eIEC61850-6-100:Application name="A1" ${id}="a1">
								<eIEC61850-6-100:FunctionRole name="FR1" ${id}="fr1">
									<eIEC61850-6-100:FunctionRoleContent ${id}="parent"/>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionRoleContent', id: 'parent' },
				referrer: {
					tagName: 'BehaviorDescriptionRef',
					attributes: { behaviorDescriptionUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:BehaviorDescriptionRef[@behaviorDescriptionUuid="uuid-target" and @behaviorDescription="S1/F1/BD1"]',
				],
			},
			'BehaviorReference with behaviorUuid → behaviorReference path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="uuid-target" ${id}="target"/>
								<eIEC61850-6-100:BehaviorDescription name="BD2" ${id}="parent"/>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'BehaviorDescription', id: 'parent' },
				referrer: { tagName: 'BehaviorReference', attributes: { behaviorUuid: 'uuid-target' } },
				expectedQueries: [
					'//v2019C1:BehaviorReference[@behaviorUuid="uuid-target" and @behaviorReference="S1/F1/BD1"]',
				],
			},
			'FunctionCategoryRef with functionCategoryUuid → functionCategory path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<eIEC61850-6-100:FunctionCategory name="Cat1" uuid="uuid-target" ${id}="target"/>
							<eIEC61850-6-100:Application name="A1" ${id}="a1">
								<eIEC61850-6-100:FunctionRole name="FR1" ${id}="fr1">
									<eIEC61850-6-100:FunctionRoleContent ${id}="parent"/>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionRoleContent', id: 'parent' },
				referrer: {
					tagName: 'FunctionCategoryRef',
					attributes: { functionCategoryUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:FunctionCategoryRef[@functionCategoryUuid="uuid-target" and @functionCategory="S1/Cat1"]',
				],
			},
			'FunctionRef with functionUuid → function path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" uuid="uuid-target" ${id}="target"/>
							<eIEC61850-6-100:Application name="A1" ${id}="a1">
								<eIEC61850-6-100:FunctionRole name="FR1" ${id}="fr1">
									<eIEC61850-6-100:FunctionRoleContent ${id}="parent"/>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionRoleContent', id: 'parent' },
				referrer: { tagName: 'FunctionRef', attributes: { functionUuid: 'uuid-target' } },
				expectedQueries: [
					'//v2019C1:FunctionRef[@functionUuid="uuid-target" and @function="S1/F1"]',
				],
			},
			'FunctionalVariantRef with functionalVariantUuid → functionalVariant path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<eIEC61850-6-100:Application name="A1" ${id}="a1">
								<eIEC61850-6-100:FunctionalVariant name="FV1" uuid="uuid-target" ${id}="target"/>
								<eIEC61850-6-100:FunctionRole name="FR1" ${id}="parent"/>
							</eIEC61850-6-100:Application>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionRole', id: 'parent' },
				referrer: {
					tagName: 'FunctionalVariantRef',
					attributes: { functionalVariantUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:FunctionalVariantRef[@functionalVariantUuid="uuid-target" and @functionalVariant="S1/A1/FV1"]',
				],
			},
			'PowerSystemRelation with relationUuid → relation path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<VoltageLevel name="V1" ${id}="v1">
								<Bay name="B1" ${id}="b1">
									<ConductingEquipment name="CB1" type="CBR" uuid="uuid-target" ${id}="target"/>
								</Bay>
							</VoltageLevel>
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:PowerSystemRelations ${id}="parent"/>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'PowerSystemRelations', id: 'parent' },
				referrer: { tagName: 'PowerSystemRelation', attributes: { relationUuid: 'uuid-target' } },
				expectedQueries: [
					'//v2019C1:PowerSystemRelation[@relationUuid="uuid-target" and @relation="S1/V1/B1/CB1"]',
				],
			},
			'PowerSystemRelationRef with powerSystemRelationUuid → powerSystemRelation path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:PowerSystemRelations ${id}="psrs">
									<eIEC61850-6-100:PowerSystemRelation name="PSR1" uuid="uuid-target" ${id}="target"/>
								</eIEC61850-6-100:PowerSystemRelations>
							</Function>
							<eIEC61850-6-100:Application name="A1" ${id}="a1">
								<eIEC61850-6-100:FunctionRole name="FR1" ${id}="fr1">
									<eIEC61850-6-100:FunctionRoleContent ${id}="parent"/>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionRoleContent', id: 'parent' },
				referrer: {
					tagName: 'PowerSystemRelationRef',
					attributes: { powerSystemRelationUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:PowerSystemRelationRef[@powerSystemRelationUuid="uuid-target" and @powerSystemRelation="S1/F1/PSR1"]',
				],
			},
			'ProcessResourceRef with processResourceUuid → processResource path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:ProcessResources ${id}="prs">
									<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-target" ${id}="target"/>
								</eIEC61850-6-100:ProcessResources>
							</Function>
							<eIEC61850-6-100:Application name="A1" ${id}="a1">
								<eIEC61850-6-100:FunctionRole name="FR1" ${id}="fr1">
									<eIEC61850-6-100:FunctionRoleContent ${id}="parent"/>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionRoleContent', id: 'parent' },
				referrer: {
					tagName: 'ProcessResourceRef',
					attributes: { processResourceUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:ProcessResourceRef[@processResourceUuid="uuid-target" and @processResource="S1/F1/PR1"]',
				],
			},
			'ProjectProcessReference with processUuid → processReference path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Process name="P1" uuid="uuid-target" ${id}="target"/>
						<eIEC61850-6-100:Project name="Prj1" ${id}="parent"/>
					</SCL>
				`,
				parent: { tagName: 'Project', id: 'parent' },
				referrer: {
					tagName: 'ProjectProcessReference',
					attributes: { processUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:ProjectProcessReference[@processUuid="uuid-target" and @processReference="P1"]',
				],
			},
			'Resource with sourceUuid → source path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<VoltageLevel name="V1" ${id}="v1">
								<Bay name="B1" uuid="uuid-target" ${id}="target"/>
							</VoltageLevel>
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:ProcessResources ${id}="prs">
									<eIEC61850-6-100:ProcessResource name="PR1" ${id}="parent"/>
								</eIEC61850-6-100:ProcessResources>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'ProcessResource', id: 'parent' },
				referrer: { tagName: 'Resource', attributes: { sourceUuid: 'uuid-target' } },
				expectedQueries: ['//v2019C1:Resource[@sourceUuid="uuid-target" and @source="S1/V1/B1"]'],
			},
			'VariableRef with variableUuid → variable path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<eIEC61850-6-100:Variable name="Var1" uuid="uuid-target" ${id}="target"/>
							<eIEC61850-6-100:Application name="A1" ${id}="a1">
								<eIEC61850-6-100:FunctionRole name="FR1" ${id}="fr1">
									<eIEC61850-6-100:FunctionRoleContent ${id}="parent"/>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'FunctionRoleContent', id: 'parent' },
				referrer: { tagName: 'VariableRef', attributes: { variableUuid: 'uuid-target' } },
				expectedQueries: [
					'//v2019C1:VariableRef[@variableUuid="uuid-target" and @variable="S1/Var1"]',
				],
			},

			// ── ancestor-name: the bare name of the ProcessResource, found upward ─────

			'SourceRef with resourceUuid → resourceName written as the ProcessResource name': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:ProcessResources ${id}="prs">
									<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-target" ${id}="target"/>
								</eIEC61850-6-100:ProcessResources>
								<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeInputs ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'LNodeInputs', id: 'parent' },
				referrer: {
					tagName: 'SourceRef',
					attributes: { input: 'Trip', resourceUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:SourceRef[@resourceUuid="uuid-target" and @resourceName="PR1"]',
				],
			},

			'ControlRef with resourceUuid → resourceName written as the ProcessResource name': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:ProcessResources ${id}="prs">
									<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-target" ${id}="target"/>
								</eIEC61850-6-100:ProcessResources>
								<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeOutputs ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'LNodeOutputs', id: 'parent' },
				referrer: {
					tagName: 'ControlRef',
					attributes: { output: 'Oper', resourceUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:ControlRef[@resourceUuid="uuid-target" and @resourceName="PR1"]',
				],
			},
			'SubscriberLNode with resourceUuid → resourceName written as the ProcessResource name': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:ProcessResources ${id}="prs">
									<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-target" ${id}="target"/>
								</eIEC61850-6-100:ProcessResources>
								<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:DOS name="Pos" ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'DOS', id: 'parent' },
				referrer: {
					tagName: 'SubscriberLNode',
					attributes: { pLN: 'XCBR', resourceUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:SubscriberLNode[@resourceUuid="uuid-target" and @resourceName="PR1"]',
				],
			},
			'ControllingLNode with resourceUuid → resourceName written as the ProcessResource name': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<eIEC61850-6-100:ProcessResources ${id}="prs">
									<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-target" ${id}="target"/>
								</eIEC61850-6-100:ProcessResources>
								<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:DOS name="Pos" ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'DOS', id: 'parent' },
				referrer: {
					tagName: 'ControllingLNode',
					attributes: { pLN: 'CSWI', resourceUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:ControllingLNode[@resourceUuid="uuid-target" and @resourceName="PR1"]',
				],
			},

			// ── lnode: the path is the LNode spec path, then .DO[.DA] from the companions ──

			'SourceRef with sourceLNodeUuid + DO/DA → source path with the data written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${id}="spec"/>
								</LNode>
								<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeInputs ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'LNodeInputs', id: 'parent' },
				referrer: {
					tagName: 'SourceRef',
					attributes: {
						input: 'Pos',
						sourceLNodeUuid: 'uuid-target',
						sourceDoName: 'Pos',
						sourceDaName: 'stVal',
					},
				},
				expectedQueries: [
					'//v2019C1:SourceRef[@sourceLNodeUuid="uuid-target" and @source="S1/F1/XCBR1.Pos.stVal"]',
				],
			},
			'ControlRef with controlledLNodeUuid + DO → controlled path with the data written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${id}="spec"/>
								</LNode>
								<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeOutputs ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'LNodeOutputs', id: 'parent' },
				referrer: {
					tagName: 'ControlRef',
					attributes: {
						output: 'Oper',
						controlledLNodeUuid: 'uuid-target',
						controlledDoName: 'Pos',
					},
				},
				expectedQueries: [
					'//v2019C1:ControlRef[@controlledLNodeUuid="uuid-target" and @controlled="S1/F1/XCBR1.Pos"]',
				],
			},
			'ProcessEcho with sourceLNodeUuid + DO/DA → source path with the data written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${id}="spec"/>
								</LNode>
								<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:DOS name="Pos" ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'DOS', id: 'parent' },
				referrer: {
					tagName: 'ProcessEcho',
					attributes: {
						sourceLNodeUuid: 'uuid-target',
						sourceDoName: 'Pos',
						sourceDaName: 'stVal',
					},
				},
				expectedQueries: [
					'//v2019C1:ProcessEcho[@sourceLNodeUuid="uuid-target" and @source="S1/F1/XCBR1.Pos.stVal"]',
				],
			},

			// ── ied-address: the path to the ExtRef / ExtCtrl in the IED section ─────

			'SourceRef with extRefUuid, LNode not allocated → extRefAddr full path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeInputs ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
						<IED name="IED1" ${id}="ied1">
							<AccessPoint name="AP1" ${id}="ap1">
								<Server ${id}="srv1">
									<Authentication ${id}="auth1"/>
									<LDevice inst="LD0" ${id}="ld0">
										<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
										<LN lnClass="PTRC" inst="1" lnType="T1" ${id}="ln1">
											<Inputs ${id}="inputs1">
												<ExtRef intAddr="Op" uuid="uuid-target" ${id}="target"/>
											</Inputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				parent: { tagName: 'LNodeInputs', id: 'parent' },
				referrer: { tagName: 'SourceRef', attributes: { input: 'Op', extRefUuid: 'uuid-target' } },
				expectedQueries: [
					'//v2019C1:SourceRef[@extRefUuid="uuid-target" and @extRefAddr="IED1/LD0/PTRC1.Op"]',
				],
			},
			'ControlRef with extCtrlUuid, LNode not allocated → extCtrlAddr full path written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeOutputs ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
						<IED name="IED1" ${id}="ied1">
							<AccessPoint name="AP1" ${id}="ap1">
								<Server ${id}="srv1">
									<Authentication ${id}="auth1"/>
									<LDevice inst="LD0" ${id}="ld0">
										<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
										<LN lnClass="CSWI" inst="1" lnType="T1" ${id}="ln1">
											<Outputs ${id}="outputs1">
												<ExtCtrl intAddr="Oper" uuid="uuid-target" ${id}="target"/>
											</Outputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				parent: { tagName: 'LNodeOutputs', id: 'parent' },
				referrer: {
					tagName: 'ControlRef',
					attributes: { output: 'Oper', extCtrlUuid: 'uuid-target' },
				},
				expectedQueries: [
					'//v2019C1:ControlRef[@extCtrlUuid="uuid-target" and @extCtrlAddr="IED1/LD0/CSWI1.Oper"]',
				],
			},

			// ── behavior-description: local path from the BehaviorDescription's parent ──

			'InputVar with lnodeUuid of the parent LNode + DO/DA → dataName "DO.DA" written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'BehaviorDescription', id: 'parent' },
				referrer: {
					tagName: 'InputVar',
					attributes: { varName: 'pos', lnodeUuid: 'uuid-target', doName: 'Pos', daName: 'stVal' },
				},
				expectedQueries: ['//v2019C1:InputVar[@lnodeUuid="uuid-target" and @dataName="Pos.stVal"]'],
			},
			'OutputVar with lnodeUuid of the parent LNode + DO → dataName "DO" written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'BehaviorDescription', id: 'parent' },
				referrer: {
					tagName: 'OutputVar',
					attributes: { varName: 'pos', lnodeUuid: 'uuid-target', doName: 'Pos' },
				},
				expectedQueries: ['//v2019C1:OutputVar[@lnodeUuid="uuid-target" and @dataName="Pos"]'],
			},
			'InputVar with inputUuid of a SourceRef of the parent LNode → inputName written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-target" ${id}="target"/>
									</eIEC61850-6-100:LNodeInputs>
									<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'BehaviorDescription', id: 'parent' },
				referrer: {
					tagName: 'InputVar',
					attributes: { varName: 'trip', inputUuid: 'uuid-target' },
				},
				expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-target" and @inputName="Trip"]'],
			},
			'OutputVar with outputUuid of a ControlRef of the parent LNode → outputName written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="CSWI" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeOutputs ${id}="outputs">
										<eIEC61850-6-100:ControlRef output="Oper" uuid="uuid-target" ${id}="target"/>
									</eIEC61850-6-100:LNodeOutputs>
									<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'BehaviorDescription', id: 'parent' },
				referrer: {
					tagName: 'OutputVar',
					attributes: { varName: 'oper', outputUuid: 'uuid-target' },
				},
				expectedQueries: ['//v2019C1:OutputVar[@outputUuid="uuid-target" and @outputName="Oper"]'],
			},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source, testCase }) => {
				await source.transaction(async (tx) => {
					await tx.addChild(testCase.parent, testCase.referrer)
				})
				return { assertOn: 'source' }
			},
		})
	})
	describe('referrer created with several uuids', () => {
		type TestCase = SclTest.BaseXmlTestCase & {
			parent: Scl.Ref<Scl.ElementsOf>
			referrer: { tagName: keyof typeof UUID_REFERENCE_PAIRS; attributes: Record<string, string> }
		}

		const testCases: SclTest.TestCases<TestCase> = {
			'SourceRef with sourceLNodeUuid and resourceUuid → source and resourceName both written': {
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<Private type="eIEC61850-6-100">
									<eIEC61850-6-100:ProcessResources>
										<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-resource"/>
									</eIEC61850-6-100:ProcessResources>
								</Private>
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target">
									<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
								</LNode>
								<LNode lnClass="PTRC" lnInst="1" iedName="None">
									<eIEC61850-6-100:LNodeInputs ${id}="parent"/>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				parent: { tagName: 'LNodeInputs', id: 'parent' },
				referrer: {
					tagName: 'SourceRef',
					attributes: {
						input: 'Pos',
						sourceLNodeUuid: 'uuid-target',
						sourceDoName: 'Pos',
						sourceDaName: 'stVal',
						resourceUuid: 'uuid-resource',
					},
				},
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/F1/XCBR1.Pos.stVal" and @resourceName="PR1"]',
				],
			},
			'ControlRef with controlledLNodeUuid and resourceUuid → controlled and resourceName both written':
				{
					sourceXml: /* xml */ `
						<SCL ${ns} ${id}="root">
							<Substation name="S1" ${id}="s1">
								<Function name="F1" ${id}="f1">
									<Private type="eIEC61850-6-100">
										<eIEC61850-6-100:ProcessResources>
											<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-resource"/>
										</eIEC61850-6-100:ProcessResources>
									</Private>
									<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target">
										<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1"/>
									</LNode>
									<LNode lnClass="CSWI" lnInst="1" iedName="None">
										<eIEC61850-6-100:LNodeOutputs ${id}="parent"/>
									</LNode>
								</Function>
							</Substation>
						</SCL>
					`,
					parent: { tagName: 'LNodeOutputs', id: 'parent' },
					referrer: {
						tagName: 'ControlRef',
						attributes: {
							output: 'Oper',
							controlledLNodeUuid: 'uuid-target',
							controlledDoName: 'Pos',
							resourceUuid: 'uuid-resource',
						},
					},
					expectedQueries: [
						'//v2019C1:ControlRef[@controlled="S1/F1/XCBR1.Pos" and @resourceName="PR1"]',
					],
				},
		}

		runSclTestCases.withExport({
			testCases,
			act: async ({ source, testCase }) => {
				await source.transaction(async (tx) => {
					await tx.addChild(testCase.parent, testCase.referrer)
				})
				return { assertOn: 'source' }
			},
		})
	})
})
