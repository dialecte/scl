import { ssd as updateSsd } from './ssd'

import { describe } from 'vitest'

import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const scopeRef = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & { targetXml: string }

const sourceXml = /* xml */ `
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
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('update.ssd (cascade to update.asd / update.fsd)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a newer SSD revision reconciles onto the instantiated scope (composed-function change lands)':
			{
				sourceXml,
				targetXml,
				expectedQueries: [
					// the composed function's newly-added LNode is reconciled into the instance
					'//default:Function[@name="Prot"]/default:LNode[@lnClass="XCBR"]',
					// the original instance content is still there
					'//default:Function[@name="Prot"]/default:LNode[@lnClass="CSWI"]',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// 1. instantiate the SSD into the project
		await target.transaction(async (tx) => {
			await instantiateSsd(tx, { sourceQuery: source.query, scopeRef, targetParent: bayRef })
		})

		// 2. a newer SSD revision adds an LNode to the composed function
		await source.transaction(async (tx) => {
			await tx.addChild({ tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>, {
				tagName: 'LNode',
				attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '1', lnType: 'CSWI_Type' },
			})
		})

		// 3. update the project against the newer SSD (headless: no gate)
		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef,
				targetParent: bayRef,
				scenario: 'template',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A first-time update (no instance yet) must delegate to instantiate.ssd, so the source is
// recorded ONCE at document level (Header > SourceFiles), not scattered per primary.
describe('update.ssd - first-time delegates to instantiate.ssd (document provenance)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'reconciling an empty project instantiates the scope and records one document-level SSD reference':
			{
				sourceXml,
				targetXml,
				expectedQueries: [
					'//v2019C1:Application[@name="HMI"]',
					'//default:Function[@name="Prot"]',
					// document-level provenance (SSD), not a per-primary ApplicationSclRef / FunctionSclRef
					'//default:Header/default:SourceFiles/default:SclFileReference[@fileType="SSD"][@fileUuid="ssd-doc-uuid"]',
				],
				unexpectedQueries: [
					// the source is an SSD, so no root-anchored ASD/FSD provenance is written
					'//v2019C1:ApplicationSclRef',
					'//v2019C1:FunctionSclRef',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef,
				targetParent: bayRef,
				scenario: 'template',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The topology frame's OWN content (Bay attributes + equipment) must reconcile too, matched by the
// stamped templateUuid lineage (rename-robust), with the fn/app subtrees left to the cascade.
describe('update.ssd - reconciles the topology frame own content', () => {
	const frameSourceXml = /* xml */ `
		<SCL ${ns} ${id}="ssd-f">
			<Header id="ssd-header-f" uuid="ssd-f-uuid" version="0" revision="1" ${id}="hdr-f"/>
			<Substation name="TEMPLATE" ${id}="sub-f">
				<VoltageLevel name="TEMPLATE" ${id}="vl-f">
					<Bay name="B1" desc="rev1" ${id}="bay-f">
						<Private type="eIEC61850-6-100" ${id}="bay-priv-f">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-f-uuid" ${id}="app-f">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-f">
									<eIEC61850-6-100:FunctionRoleContent ${id}="frc-f">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="fn-f-uuid" ${id}="app-fref-f"/>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<ConductingEquipment name="QA1" type="CBR" ${id}="ce-f"/>
						<Function name="Prot" uuid="fn-f-uuid" ${id}="fn-f">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-f-uuid" ${id}="lnode-f"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-f">
				<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-f">
					<DO name="Pos" type="DPC_Type" ${id}="do-f"/>
				</LNodeType>
				<DOType id="DPC_Type" cdc="DPC" ${id}="dot-f">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-f"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>`

	const frameTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd-f">
			<Header id="proj-f" uuid="proj-f-uuid" ${id}="hdr-tf"/>
			<Substation name="S1" ${id}="sub-tf">
				<VoltageLevel name="V1" ${id}="vl-tf"/>
			</Substation>
		</SCL>`

	const frameScope = { tagName: 'Bay', id: 'bay-f' } as Scl.Ref<'Bay'>
	const targetVl = { tagName: 'VoltageLevel', id: 'vl-tf' } as Scl.Ref<'VoltageLevel'>

	const testCases: SclTest.TestCases<TestCase> = {
		'a Bay attribute change and a new equipment reconcile onto the instance, matched by templateUuid':
			{
				sourceXml: frameSourceXml,
				targetXml: frameTargetXml,
				expectedQueries: [
					// the Bay's own attribute is reconciled in place (matched by stamped lineage)
					'//default:Bay[@name="B1"][@desc="rev2"]',
					// the original equipment is preserved and the newly-added one is grafted
					'//default:Bay[@name="B1"]/default:ConductingEquipment[@name="QA1"]',
					'//default:Bay[@name="B1"]/default:ConductingEquipment[@name="QA2"]',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// 1. instantiate the SSD scope Bay under the project VoltageLevel
		await target.transaction(async (tx) => {
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: frameScope,
				targetParent: targetVl,
			})
		})

		// 2. a newer SSD revision edits the Bay and adds equipment
		await source.transaction(async (tx) => {
			await tx.update(frameScope, { attributes: { desc: 'rev2' } })
			await tx.addChild(frameScope, {
				tagName: 'ConductingEquipment',
				attributes: { name: 'QA2', type: 'CBR' },
			})
		})

		// 3. reconcile the project against the newer SSD
		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: frameScope,
				targetParent: targetVl,
				scenario: 'template',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
// A bay-typical may be instantiated more than once (several bays share one templateUuid). update.ssd
// must reconcile the frame own-content onto EVERY matching instance, not just the first.
describe('update.ssd - reconciles the frame onto ALL instances of a bay-typical', () => {
	const multiSourceXml = /* xml */ `
		<SCL ${ns} ${id}="ssd-m">
			<Header id="ssd-header-m" uuid="ssd-m-uuid" version="0" revision="1" ${id}="hdr-m"/>
			<Substation name="TEMPLATE" ${id}="sub-m">
				<VoltageLevel name="TEMPLATE" ${id}="vl-m">
					<Bay name="B1" desc="rev1" ${id}="bay-m">
						<ConductingEquipment name="QA1" type="CBR" ${id}="ce-m"/>
						<Function name="Prot" uuid="fn-m-uuid" ${id}="fn-m">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-m-uuid" ${id}="lnode-m"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-m">
				<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-m">
					<DO name="Pos" type="DPC_Type" ${id}="do-m"/>
				</LNodeType>
				<DOType id="DPC_Type" cdc="DPC" ${id}="dot-m">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-m"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>`

	const multiTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd-m">
			<Header id="proj-m" uuid="proj-m-uuid" ${id}="hdr-tm"/>
			<Substation name="S1" ${id}="sub-tm">
				<VoltageLevel name="VA" ${id}="vl-a"/>
				<VoltageLevel name="VB" ${id}="vl-b"/>
			</Substation>
		</SCL>`

	const multiScope = { tagName: 'Bay', id: 'bay-m' } as Scl.Ref<'Bay'>
	const vlA = { tagName: 'VoltageLevel', id: 'vl-a' } as Scl.Ref<'VoltageLevel'>
	const vlB = { tagName: 'VoltageLevel', id: 'vl-b' } as Scl.Ref<'VoltageLevel'>

	const testCases: SclTest.TestCases<TestCase> = {
		'a newer revision reconciles onto BOTH instantiated bays (matched by templateUuid), not just the first':
			{
				sourceXml: multiSourceXml,
				targetXml: multiTargetXml,
				expectedQueries: [
					// both bays get the attribute change reconciled in place
					'//default:VoltageLevel[@name="VA"]/default:Bay[@desc="rev2"]',
					'//default:VoltageLevel[@name="VB"]/default:Bay[@desc="rev2"]',
					// both bays get the newly-added equipment grafted
					'//default:VoltageLevel[@name="VA"]/default:Bay/default:ConductingEquipment[@name="QA2"]',
					'//default:VoltageLevel[@name="VB"]/default:Bay/default:ConductingEquipment[@name="QA2"]',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// 1. instantiate the same bay-typical under TWO VoltageLevels -> two bays, one templateUuid
		await target.transaction(async (tx) => {
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: multiScope,
				targetParent: vlA,
			})
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: multiScope,
				targetParent: vlB,
			})
		})

		// 2. a newer SSD revision edits the Bay and adds equipment
		await source.transaction(async (tx) => {
			await tx.update(multiScope, { attributes: { desc: 'rev2' } })
			await tx.addChild(multiScope, {
				tagName: 'ConductingEquipment',
				attributes: { name: 'QA2', type: 'CBR' },
			})
		})

		// 3. reconcile the project against the newer SSD (headless: no gate)
		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: multiScope,
				targetParent: vlA,
				scenario: 'template',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The optional `targetInstance` anchor scopes an update to ONE placed bay: only that instance's
// frame reconciles, the sibling instance of the same bay-typical is left untouched.
describe('update.ssd - targetInstance scopes the update to one bay instance', () => {
	const multiSourceXml = /* xml */ `
		<SCL ${ns} ${id}="ssd-t">
			<Header id="ssd-header-t" uuid="ssd-t-uuid" version="0" revision="1" ${id}="hdr-ti"/>
			<Substation name="TEMPLATE" ${id}="sub-ti">
				<VoltageLevel name="TEMPLATE" ${id}="vl-ti">
					<Bay name="B1" desc="rev1" ${id}="bay-ti">
						<ConductingEquipment name="QA1" type="CBR" ${id}="ce-ti"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>`

	const multiTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd-t">
			<Header id="proj-t" uuid="proj-t-uuid" ${id}="hdr-tti"/>
			<Substation name="S1" ${id}="sub-tti">
				<VoltageLevel name="VA" ${id}="vl-ta"/>
				<VoltageLevel name="VB" ${id}="vl-tb"/>
			</Substation>
		</SCL>`

	const tScope = { tagName: 'Bay', id: 'bay-ti' } as Scl.Ref<'Bay'>
	const tVlA = { tagName: 'VoltageLevel', id: 'vl-ta' } as Scl.Ref<'VoltageLevel'>
	const tVlB = { tagName: 'VoltageLevel', id: 'vl-tb' } as Scl.Ref<'VoltageLevel'>

	const testCases: SclTest.TestCases<TestCase> = {
		'only the anchored bay (under VA) reconciles; the sibling under VB is untouched': {
			sourceXml: multiSourceXml,
			targetXml: multiTargetXml,
			expectedQueries: [
				// the anchored instance gets the change
				'//default:VoltageLevel[@name="VA"]/default:Bay[@desc="rev2"]',
				'//default:VoltageLevel[@name="VA"]/default:Bay/default:ConductingEquipment[@name="QA2"]',
				// the sibling keeps the original revision (no QA2, still rev1)
				'//default:VoltageLevel[@name="VB"]/default:Bay[@desc="rev1"]',
			],
			unexpectedQueries: [
				'//default:VoltageLevel[@name="VB"]/default:Bay[@desc="rev2"]',
				'//default:VoltageLevel[@name="VB"]/default:Bay/default:ConductingEquipment[@name="QA2"]',
			],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// 1. instantiate the same bay-typical under two VoltageLevels
		await target.transaction(async (tx) => {
			await instantiateSsd(tx, { sourceQuery: source.query, scopeRef: tScope, targetParent: tVlA })
			await instantiateSsd(tx, { sourceQuery: source.query, scopeRef: tScope, targetParent: tVlB })
		})

		// resolve the bay instance under VA (the anchor)
		const [bayUnderVA] = await target.query.any.getChildren(tVlA, 'Bay')
		if (!bayUnderVA) throw new Error('bay under VA not found')
		const targetInstance = { tagName: 'Bay', id: bayUnderVA.id } as Scl.Ref<'Bay'>

		// 2. a newer SSD revision edits the Bay and adds equipment
		await source.transaction(async (tx) => {
			await tx.update(tScope, { attributes: { desc: 'rev2' } })
			await tx.addChild(tScope, {
				tagName: 'ConductingEquipment',
				attributes: { name: 'QA2', type: 'CBR' },
			})
		})

		// 3. update scoped to the VA instance only
		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: tScope,
				targetParent: tVlA,
				scenario: 'template',
				targetInstance,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('update.ssd - fork keeps identity', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a fork adopts the SSD as a project base (source uuids preserved, no templateUuid)': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"][@uuid="app-src-uuid"]',
				'//default:Function[@name="Prot"][@uuid="fn-src-uuid"]',
			],
			unexpectedQueries: ['//v2019C1:Application[@templateUuid]'],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef,
				targetParent: bayRef,
				scenario: 'fork',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
