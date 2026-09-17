import { ssd } from './ssd'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	targetParentId: string
	mode?: 'stamp-template' | 'keep'
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

		'keep mode adopts the SSD as a project base: source uuids are preserved, no templateUuid stamped':
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
				mode: 'keep',
				expectedQueries: [
					// project-base: the SSD's own uuids are adopted verbatim
					'//v2019C1:Application[@name="HMI"][@uuid="app-src-uuid"]',
					'//default:Function[@name="Prot"][@uuid="fn-src-uuid"]',
					'//default:Function/default:LNode[@uuid="lnode-src-uuid"]',
					// the composed FunctionRef still resolves to the kept Function uuid
					'//v2019C1:FunctionRef[@functionUuid="fn-src-uuid"]',
				],
				unexpectedQueries: [
					// keep mode does not stamp template lineage
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
				...(testCase.mode ? { mode: testCase.mode } : {}),
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
