import { ssd } from './ssd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	targetParentId: string
	scenario?: LifecycleScenario
}

describe('instantiate.ssd', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'clones the SSD scope (Application + composed Function + type closure), stamps lineage, records document provenance':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="14" ${id}="hdr-s"/>
						<Substation name="TEMPLATE" ${id}="sub-s">
							<VoltageLevel name="TEMPLATE" ${id}="vl-s">
								<Bay name="B1" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="bay-priv-s">
										<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-1">
										<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-src-uuid" ${id}="lnode-1"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
								<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
							</LNodeType>
							<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
								<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" ${id}="bay-t"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetParentId: 'bay-t',
				expectedQueries: [
					// the Application is cloned and records its SSD counterpart as templateUuid
					'//v2019C1:Application[@name="HMI"][@templateUuid="app-src-uuid"]',
					// the composed Function is cloned + stamped
					'//default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
					'//default:Function/default:LNode[@templateUuid="lnode-src-uuid"]',
					// its type closure travels
					'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]/default:DO[@name="Pos"]',
					// instantiation provenance: the SSD file, recorded once at the document Header
					'//default:Header/default:SourceFiles/default:SclFileReference[@fileType="SSD"][@fileUuid="ssd-doc-uuid"][@version="0"][@revision="14"]',
				],
				unexpectedQueries: [
					// instances receive fresh uuids; source uuids survive only as templateUuid
					'//v2019C1:Application[@uuid="app-src-uuid"]',
					'//default:Function[@uuid="fn-src-uuid"]',
				],
			},

		'a fork adopts the SSD as a project base: source uuids are preserved, no templateUuid stamped':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="14" ${id}="hdr-s"/>
						<Substation name="TEMPLATE" ${id}="sub-s">
							<VoltageLevel name="TEMPLATE" ${id}="vl-s">
								<Bay name="B1" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="bay-priv-s">
										<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
									<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-1">
										<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-src-uuid" ${id}="lnode-1"/>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
						<DataTypeTemplates ${id}="dtt-s">
							<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
								<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
							</LNodeType>
							<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
								<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
							</DOType>
						</DataTypeTemplates>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t">
								<Bay name="B1" ${id}="bay-t"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetParentId: 'bay-t',
				scenario: 'fork',
				expectedQueries: [
					// project-base: the SSD's own uuids are adopted verbatim
					'//v2019C1:Application[@name="HMI"][@uuid="app-src-uuid"]',
					'//default:Function[@name="Prot"][@uuid="fn-src-uuid"]',
					'//default:Function/default:LNode[@uuid="lnode-src-uuid"]',
					// the composed FunctionRef still resolves to the kept Function uuid
					'//v2019C1:FunctionRef[@functionUuid="fn-src-uuid"]',
				],
				unexpectedQueries: [
					// a fork does not stamp template lineage
					'//v2019C1:Application[@templateUuid]',
					'//default:Function[@name="Prot"][@templateUuid]',
				],
			},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			const root = await tx.getRoot()
			await ssd(tx, {
				sourceQuery: source.query,
				targetParent: root,
				...(testCase.scenario ? { scenario: testCase.scenario } : {}),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('instantiate.ssd - placement collision', () => {
	const collisionSource = /* xml */ `
		<SCL ${ns} ${id}="ssd">
			<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="14" ${id}="hdr-s"/>
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="B1" ${id}="bay-s">
						<Private type="eIEC61850-6-100" ${id}="bay-priv-s">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-src-uuid" ${id}="lnode-1"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-s">
				<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
					<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
				</LNodeType>
				<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>
	`

	type CollisionCase = SclTest.BaseXmlTestCase & { targetXml: string }

	const targetVl = { tagName: 'VoltageLevel', id: 'vl-t' } as Scl.Ref<'VoltageLevel'>

	const testCases: SclTest.TestCases<CollisionCase> = {
		'instantiating the same bay-typical twice under one VoltageLevel yields two distinct bays (B1, B1_1)':
			{
				sourceXml: collisionSource,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
						<Substation name="S1" ${id}="sub-t">
							<VoltageLevel name="V1" ${id}="vl-t"/>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					// two distinct bays: the second's colliding name is bumped
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1_1"]',
					// each bay owns its OWN Application + Function (not bumped: different parents)
					'//default:Bay[@name="B1"]//v2019C1:Application[@name="HMI"]',
					'//default:Bay[@name="B1_1"]//v2019C1:Application[@name="HMI"]',
					'//default:Bay[@name="B1"]/default:Function[@name="Prot"]',
					'//default:Bay[@name="B1_1"]/default:Function[@name="Prot"]',
				],
				unexpectedQueries: [
					// the bays are distinct instances, so the fn/app names never collide -> never bumped
					'//v2019C1:Application[@name="HMI_1"]',
					'//default:Function[@name="Prot_1"]',
					// no third bay, no unbumped duplicate
					'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"][2]',
				],
			},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<CollisionCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		for (let i = 0; i < 2; i++) {
			await target.transaction(async (tx) => {
				await ssd(tx, { sourceQuery: source.query, targetParent: targetVl })
			})
		}

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * The terminals of an instantiated bay-typical name the nodes placed with it: the uuid of the
 * placed node, its path and level names under the project's levels.
 */
describe('instantiate.ssd - connectivity', () => {
	const L1 = '00000000-0000-4000-8000-000000000001'
	const connectivitySource = /* xml */ `
		<SCL ${ns} ${id}="ssd">
			<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="14" ${id}="hdr-s"/>
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="B1" ${id}="bay-s">
						<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
							<Terminal connectivityNode="TEMPLATE/TEMPLATE/B1/L1" substationName="TEMPLATE" voltageLevelName="TEMPLATE" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="feeder"/>
						</ConductingEquipment>
						<ConnectivityNode name="L1" pathName="TEMPLATE/TEMPLATE/B1/L1" uuid="${L1}" ${id}="l1"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	type ConnectivityCase = SclTest.BaseXmlTestCase & { targetXml: string; times: number }

	const targetVl = { tagName: 'VoltageLevel', id: 'vl-t' } as Scl.Ref<'VoltageLevel'>
	const targetXml = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t"/>
			</Substation>
		</SCL>
	`

	const testCases: SclTest.TestCases<ConnectivityCase> = {
		'bay-typical placed → its terminals name the placed node under the project levels': {
			sourceXml: connectivitySource,
			targetXml,
			times: 1,
			expectedQueries: [
				`//default:Bay[@name="B1"]/default:ConnectivityNode[@name="L1" and @pathName="S1/V1/B1/L1" and @templateUuid="${L1}"]`,
				'//default:Terminal[@connectivityNode="S1/V1/B1/L1" and @substationName="S1" and @voltageLevelName="V1" and @bayName="B1" and @cNodeName="L1"]',
				'//default:Terminal[@cNodeUuid = //default:ConnectivityNode[@name="L1"]/@uuid]',
			],
			unexpectedQueries: [
				`//default:Terminal[@cNodeUuid="${L1}"]`,
				'//default:*[@substationName="TEMPLATE"]',
			],
		},
		"bay-typical placed twice → each copy's terminals name the node of their own bay": {
			sourceXml: connectivitySource,
			targetXml,
			times: 2,
			expectedQueries: [
				'//default:Bay[@name="B1_1"]/default:ConnectivityNode[@name="L1" and @pathName="S1/V1/B1_1/L1"]',
				'//default:Bay[@name="B1_1"]//default:Terminal[@connectivityNode="S1/V1/B1_1/L1" and @bayName="B1_1" and @cNodeUuid = //default:Bay[@name="B1_1"]/default:ConnectivityNode/@uuid]',
				'//default:Bay[@name="B1"]//default:Terminal[@connectivityNode="S1/V1/B1/L1" and @cNodeUuid = //default:Bay[@name="B1"]/default:ConnectivityNode/@uuid]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<ConnectivityCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		for (let time = 0; time < testCase.times; time++) {
			await target.transaction(async (tx) => {
				await ssd(tx, { sourceQuery: source.query, targetParent: targetVl })
			})
		}

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A function the consumer leaves out holds a variable an application's role refers to: neither is written. */
describe('instantiate.ssd - a function left out holding what a role refers to', () => {
	const sourceXml = /* xml */ `
		<SCL ${ns} ${id}="ssd">
			<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
					<Bay name="Feeder" uuid="feeder-source-uuid" ${id}="feeder-s">
						<Private type="eIEC61850-6-100" ${id}="feeder-private-s">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="hmi-source-uuid" ${id}="hmi-s">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="hmi-role-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="hmi-role-content-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Disp" functionUuid="display-source-uuid" ${id}="hmi-function-ref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
								<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="hmi-engineering-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="hmi-engineering-content-s">
										<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/Feeder/Prot/VPROT" variableUuid="vprot-source-uuid" ${id}="hmi-vprot-ref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" uuid="protection-source-uuid" ${id}="protection-s">
							<Private type="eIEC61850-6-100" ${id}="protection-private-s">
								<eIEC61850-6-100:Variable name="VPROT" value="1" uuid="vprot-source-uuid" ${id}="vprot-s">
									<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/Feeder/Prot" elementUuid="protection-source-uuid" ${id}="vprot-apply-s"/>
								</eIEC61850-6-100:Variable>
							</Private>
						</Function>
						<Function name="Disp" uuid="display-source-uuid" ${id}="display-s"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase & { targetXml: string }> = {
		"Prot left out → neither the variable it holds nor the role's reference to it is written": {
			sourceXml,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scd">
					<Header id="project" uuid="project-uuid" ${id}="header-t"/>
					<Substation name="S1" ${id}="substation-t">
						<VoltageLevel name="V1" ${id}="voltage-level-t"/>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:Application[@name="HMI"]', '//default:Function[@name="Disp"]'],
			unexpectedQueries: [
				'//default:Function[@name="Prot"]',
				'//v2019C1:Variable[@name="VPROT"]',
				'//v2019C1:VariableRef',
			],
		},
		"Prot left out, holding too a variable the role refers to applying to the bay → that one written, and the role's reference to it":
			{
				sourceXml: sourceXml
					.replace(
						`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/Feeder/Prot/VPROT" variableUuid="vprot-source-uuid" ${id}="hmi-vprot-ref-s"/>`,
						[
							`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/Feeder/Prot/VPROT" variableUuid="vprot-source-uuid" ${id}="hmi-vprot-ref-s"/>`,
							`<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/Feeder/Prot/VFEEDER" variableUuid="vfeeder-source-uuid" ${id}="hmi-vfeeder-ref-s"/>`,
						].join(''),
					)
					.replace(
						`</eIEC61850-6-100:Variable>`,
						[
							`</eIEC61850-6-100:Variable>`,
							`<eIEC61850-6-100:Variable name="VFEEDER" value="2" uuid="vfeeder-source-uuid" ${id}="vfeeder-s">`,
							`<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/Feeder" elementUuid="feeder-source-uuid" ${id}="vfeeder-apply-s"/>`,
							`</eIEC61850-6-100:Variable>`,
						].join(''),
					),
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="V1" ${id}="voltage-level-t"/>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:Variable[@name="VFEEDER"]/v2019C1:VariableApplyTo[@elementUuid=//default:Bay[@name="Feeder"]/@uuid]',
					'//v2019C1:Application[@name="HMI"][count(.//v2019C1:VariableRef)=1]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VFEEDER"]/@uuid]',
				],
				unexpectedQueries: [
					'//default:Function[@name="Prot"]',
					'//v2019C1:Variable[@name="VPROT"]',
				],
			},
	}

	async function act({
		source,
		target,
	}: SclTest.ActParams<
		SclTest.BaseXmlTestCase & { targetXml: string }
	>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function placeWithoutProt(tx) {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: 'Bay', id: 'feeder-s' },
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				decisionMappings: new Map([
					['voltage-level-s', { existing: { tagName: 'VoltageLevel', id: 'voltage-level-t' } }],
				]),
				leftOut: new Set([
					'protection-s',
					'protection-private-s',
					'vprot-s',
					'vprot-apply-s',
					'vfeeder-s',
					'vfeeder-apply-s',
				]),
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * An application the consumer leaves out composes the function of the voltage level holding a variable another
 * application's role refers to: that function is placed as its own decision says, the variable with it, the reference
 * to it naming its copy — or none of them when the function is left out too.
 */
describe('instantiate.ssd - an application left out composing the function holding what a role refers to', () => {
	const sourceXml = /* xml */ `
		<SCL ${ns} ${id}="ssd">
			<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
			<Substation name="TEMPLATE" ${id}="substation-s">
				<VoltageLevel name="TEMPLATE" uuid="voltage-level-source-uuid" ${id}="voltage-level-s">
					<Bay name="B9" uuid="bay-source-uuid" ${id}="bay-s">
						<Private type="eIEC61850-6-100" ${id}="bay-private-s">
							<eIEC61850-6-100:Application name="APP_A" uuid="a-source-uuid" ${id}="a-s">
								<eIEC61850-6-100:FunctionRole name="ENGINEERING ELEMENTS" ${id}="a-engineering-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="a-engineering-content-s">
										<eIEC61850-6-100:VariableRef variable="TEMPLATE/TEMPLATE/F_UP/VUP" variableUuid="vup-source-uuid" ${id}="a-vup-ref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
							<eIEC61850-6-100:Application name="APP_B" uuid="b-source-uuid" ${id}="b-s">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="b-root-s">
									<eIEC61850-6-100:FunctionRoleContent ${id}="b-root-content-s">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/F_UP" functionUuid="f-up-source-uuid" ${id}="b-f-up-ref-s"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
					</Bay>
					<Function name="F_UP" uuid="f-up-source-uuid" ${id}="f-up-s">
						<Private type="eIEC61850-6-100" ${id}="f-up-private-s">
							<eIEC61850-6-100:Variable name="VUP" value="7" uuid="vup-source-uuid" ${id}="vup-s">
								<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/F_UP" elementUuid="f-up-source-uuid" ${id}="vup-apply-s"/>
							</eIEC61850-6-100:Variable>
						</Private>
					</Function>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const targetXml = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Header id="project" uuid="project-uuid" ${id}="header-t"/>
			<Substation name="S1" ${id}="substation-t">
				<VoltageLevel name="V1" uuid="project-voltage-level-uuid" ${id}="voltage-level-t"/>
			</Substation>
		</SCL>
	`
	const appBLeftOut = ['b-s', 'b-root-s', 'b-root-content-s', 'b-f-up-ref-s']
	type LeftOutCase = SclTest.BaseXmlTestCase & { targetXml: string; leftOut: string[] }
	const testCases: SclTest.TestCases<LeftOutCase> = {
		'APP_B left out → F_UP placed with the variable it holds, the reference of the role of APP_A naming its copy':
			{
				sourceXml,
				targetXml,
				leftOut: appBLeftOut,
				expectedQueries: [
					'//v2019C1:Application[@name="APP_A"]',
					'//default:VoltageLevel[@name="V1"]/default:Function[@name="F_UP"]//v2019C1:Variable[@name="VUP"]/v2019C1:VariableApplyTo[@elementUuid=//default:Function[@name="F_UP"]/@uuid]',
					'//v2019C1:Application[@name="APP_A"]//v2019C1:VariableRef[@variableUuid=//v2019C1:Variable[@name="VUP"]/@uuid]',
				],
				unexpectedQueries: ['//v2019C1:Application[@name="APP_B"]'],
			},
		'APP_B and F_UP left out → F_UP, the variable it holds and the reference of the role of APP_A to it are not written':
			{
				sourceXml,
				targetXml,
				leftOut: [...appBLeftOut, 'f-up-s', 'f-up-private-s', 'vup-s', 'vup-apply-s'],
				expectedQueries: ['//v2019C1:Application[@name="APP_A"]'],
				unexpectedQueries: [
					'//v2019C1:Application[@name="APP_B"]',
					'//default:Function[@name="F_UP"]',
					'//v2019C1:Variable[@name="VUP"]',
					'//v2019C1:VariableRef',
				],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<LeftOutCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function placeWithoutAppB(tx) {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: 'Bay', id: 'bay-s' },
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				decisionMappings: new Map([
					['voltage-level-s', { existing: { tagName: 'VoltageLevel', id: 'voltage-level-t' } }],
				]),
				leftOut: new Set(testCase.leftOut),
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** A fork placed onto what the project holds already: what the project holds by its uuid, or keyed by it, is the fork's. */
describe('instantiate.ssd - a fork onto what the project holds', () => {
	type ForkCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** The project elements the template's levels are mapped onto, by source record id. */
		mapped: Record<string, Scl.Ref<Scl.ElementsOf>>
	}
	const testCases: SclTest.TestCases<ForkCase> = {
		'the project holds the function of the level the application composes, of its uuid → the application refers to it, none written again':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" uuid="voltage-level-source-uuid" ${id}="voltage-level-s">
								<Bay name="B9" uuid="bay-source-uuid" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="bay-private-s">
										<eIEC61850-6-100:Application name="APP_B" uuid="b-source-uuid" ${id}="b-s">
											<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="b-root-s">
												<eIEC61850-6-100:FunctionRoleContent ${id}="b-root-content-s">
													<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/F_UP" functionUuid="f-up-source-uuid" ${id}="b-f-up-ref-s"/>
												</eIEC61850-6-100:FunctionRoleContent>
											</eIEC61850-6-100:FunctionRole>
										</eIEC61850-6-100:Application>
									</Private>
								</Bay>
								<Function name="F_UP" uuid="f-up-source-uuid" ${id}="f-up-s"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="V1" uuid="project-voltage-level-uuid" ${id}="voltage-level-t">
								<Function name="F_UP" uuid="f-up-source-uuid" ${id}="f-up-t"/>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				mapped: { 'voltage-level-s': { tagName: 'VoltageLevel', id: 'voltage-level-t' } },
				expectedQueries: [
					'//v2019C1:Application[@name="APP_B"]',
					'/default:SCL[count(.//default:Function)=1]',
				],
			},
		"the project's bay holding a copy of the bay's variable made by another placement (keyed by its template reference) → the fork writes its own":
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="ssd">
						<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
						<Substation name="TEMPLATE" ${id}="substation-s">
							<VoltageLevel name="TEMPLATE" uuid="voltage-level-source-uuid" ${id}="voltage-level-s">
								<Bay name="B1" uuid="bay-source-uuid" ${id}="bay-s">
									<Private type="eIEC61850-6-100" ${id}="bay-private-s">
										<eIEC61850-6-100:Variable name="VBAY" value="2" uuid="vbay-source-uuid" ${id}="vbay-s">
											<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1" elementUuid="bay-source-uuid" ${id}="vbay-apply-s"/>
										</eIEC61850-6-100:Variable>
									</Private>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="project" uuid="project-uuid" ${id}="header-t"/>
						<Substation name="S1" ${id}="substation-t">
							<VoltageLevel name="V1" uuid="project-voltage-level-uuid" ${id}="voltage-level-t">
								<Bay name="B1" uuid="project-bay-uuid" ${id}="bay-t">
									<Private type="eIEC61850-6-100" ${id}="bay-private-t">
										<eIEC61850-6-100:Variable name="VOLD" value="9" uuid="project-vold-uuid" templateUuid="vbay-source-uuid" ${id}="vold-t">
											<eIEC61850-6-100:VariableApplyTo element="S1/V1/B1" elementUuid="project-bay-uuid" ${id}="vold-apply-t"/>
										</eIEC61850-6-100:Variable>
									</Private>
								</Bay>
							</VoltageLevel>
						</Substation>
					</SCL>
				`,
				mapped: {
					'voltage-level-s': { tagName: 'VoltageLevel', id: 'voltage-level-t' },
					'bay-s': { tagName: 'Bay', id: 'bay-t' },
				},
				expectedQueries: [
					'//default:Bay[@name="B1"]//v2019C1:Variable[@uuid="vbay-source-uuid"]/v2019C1:VariableApplyTo[@elementUuid="project-bay-uuid"]',
					'/default:SCL[count(.//v2019C1:Variable)=2]',
				],
			},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<ForkCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await target.transaction(async function forkTheBay(tx) {
			await ssd(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: 'Bay', id: 'bay-s' },
				targetParent: { tagName: 'VoltageLevel', id: 'voltage-level-t' },
				decisionMappings: new Map(
					Object.entries(testCase.mapped).map(function decided([sourceId, existing]) {
						return [sourceId, { existing }] as const
					}),
				),
				scenario: 'fork',
			})
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
