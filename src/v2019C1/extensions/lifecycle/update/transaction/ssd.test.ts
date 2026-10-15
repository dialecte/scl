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
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

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
		</SCL>
	`

	const frameTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd-f">
			<Header id="proj-f" uuid="proj-f-uuid" ${id}="hdr-tf"/>
			<Substation name="S1" ${id}="sub-tf">
				<VoltageLevel name="V1" ${id}="vl-tf"/>
			</Substation>
		</SCL>
	`

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
		</SCL>
	`

	const multiTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd-m">
			<Header id="proj-m" uuid="proj-m-uuid" ${id}="hdr-tm"/>
			<Substation name="S1" ${id}="sub-tm">
				<VoltageLevel name="VA" ${id}="vl-a"/>
				<VoltageLevel name="VB" ${id}="vl-b"/>
			</Substation>
		</SCL>
	`

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
		</SCL>
	`

	const multiTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd-t">
			<Header id="proj-t" uuid="proj-t-uuid" ${id}="hdr-tti"/>
			<Substation name="S1" ${id}="sub-tti">
				<VoltageLevel name="VA" ${id}="vl-ta"/>
				<VoltageLevel name="VB" ${id}="vl-tb"/>
			</Substation>
		</SCL>
	`

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

// Equipment a newer revision adds to a bay may refer to an element the bay already holds (here an
// LNode of the bay's function): the reference must point at the element of ITS OWN bay.
describe('update.ssd - a reference added with the frame points at the element of its own bay', () => {
	const referenceSourceXml = /* xml */ `
		<SCL ${ns} ${id}="ssd-r">
			<Header id="ssd-header-r" uuid="ssd-r-uuid" version="0" revision="1" ${id}="hdr-r"/>
			<Substation name="TEMPLATE" ${id}="sub-r">
				<VoltageLevel name="TEMPLATE" ${id}="vl-r">
					<Bay name="B1" ${id}="bay-r">
						<ConductingEquipment name="QA1" type="CBR" ${id}="ce-r"/>
						<Function name="Prot" uuid="fn-r-uuid" ${id}="fn-r">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-r-uuid" ${id}="lnode-r"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-r">
				<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-r">
					<DO name="Pos" type="DPC_Type" ${id}="do-r"/>
				</LNodeType>
				<DOType id="DPC_Type" cdc="DPC" ${id}="dot-r">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-r"/>
				</DOType>
			</DataTypeTemplates>
		</SCL>
	`

	const referenceTargetXml = /* xml */ `
		<SCL ${ns} ${id}="scd-r">
			<Header id="proj-r" uuid="proj-r-uuid" ${id}="hdr-tr"/>
			<Substation name="S1" ${id}="sub-tr">
				<VoltageLevel name="VA" ${id}="vl-ra"/>
				<VoltageLevel name="VB" ${id}="vl-rb"/>
			</Substation>
		</SCL>
	`

	const referenceScope = { tagName: 'Bay', id: 'bay-r' } as Scl.Ref<'Bay'>
	const equipmentRef = {
		tagName: 'ConductingEquipment',
		id: 'ce-r',
	} as Scl.Ref<'ConductingEquipment'>
	const voltageLevelA = { tagName: 'VoltageLevel', id: 'vl-ra' } as Scl.Ref<'VoltageLevel'>
	const voltageLevelB = { tagName: 'VoltageLevel', id: 'vl-rb' } as Scl.Ref<'VoltageLevel'>

	const testCases: SclTest.TestCases<TestCase> = {
		'the equipment of each bay gains a function fed by the LNode of that bay': {
			sourceXml: referenceSourceXml,
			targetXml: referenceTargetXml,
			expectedQueries: [
				'//default:VoltageLevel[@name="VA"]/default:Bay//v2019C1:SourceRef[@sourceLNodeUuid = //default:VoltageLevel[@name="VA"]/default:Bay/default:Function/default:LNode/@uuid]',
				'//default:VoltageLevel[@name="VB"]/default:Bay//v2019C1:SourceRef[@sourceLNodeUuid = //default:VoltageLevel[@name="VB"]/default:Bay/default:Function/default:LNode/@uuid]',
			],
			unexpectedQueries: ['//v2019C1:SourceRef[@sourceLNodeUuid="lnode-r-uuid"]'],
		},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// 1. the same bay-typical under two VoltageLevels
		await target.transaction(async (tx) => {
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: referenceScope,
				targetParent: voltageLevelA,
			})
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: referenceScope,
				targetParent: voltageLevelB,
			})
		})

		// 2. a newer revision gives the equipment a function whose LNode is fed by the bay function's LNode
		await source.transaction(async (tx) => {
			const equipmentFunction = await tx.addChild(equipmentRef, {
				tagName: 'EqFunction',
				attributes: { name: 'Switch', uuid: 'eq-function-r-uuid' },
			})
			const logicalNode = await tx.addChild(equipmentFunction, {
				tagName: 'LNode',
				attributes: {
					iedName: 'None',
					lnClass: 'XCBR',
					lnInst: '1',
					lnType: 'CSWI_Type',
					uuid: 'eq-lnode-r-uuid',
				},
			})
			const inputs = await tx.addChild(logicalNode, { tagName: 'LNodeInputs', attributes: {} })
			await tx.addChild(inputs, {
				tagName: 'SourceRef',
				attributes: {
					input: 'Position',
					source: 'TEMPLATE/TEMPLATE/B1/Prot/CSWI1',
					sourceLNodeUuid: 'lnode-r-uuid',
					sourceDoName: 'Pos',
					sourceDaName: 'stVal',
					uuid: 'source-ref-r-uuid',
				},
			})
		})

		// 3. reconcile the project against the newer SSD (headless: no gate)
		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: referenceScope,
				targetParent: voltageLevelA,
				scenario: 'template',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// An application of a bay typical placed in several bays lives in each of them: a function its
// template gains belongs in the bay of each instance, not only where the update was started.
describe('update.ssd - a function the application of a bay typical gains is placed in each bay', () => {
	const typicalSourceXml = /* xml */ `
		<SCL ${ns} ${id}="ssd-g">
			<Header id="ssd-header-g" uuid="ssd-g-uuid" version="0" revision="1" ${id}="header-g"/>
			<Substation name="TEMPLATE" ${id}="substation-g">
				<VoltageLevel name="TEMPLATE" ${id}="voltage-level-g">
					<Bay name="B1" ${id}="bay-g">
						<Private type="eIEC61850-6-100" ${id}="bay-private-g">
							<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-g-uuid" ${id}="application-g">
								<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-g">
									<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-g">
										<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="protection-g-uuid" ${id}="protection-ref-g"/>
										<!-- gained by the update: <FunctionRef function="TEMPLATE/TEMPLATE/B1/Ctrl"/> -->
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
						<Function name="Prot" uuid="protection-g-uuid" ${id}="protection-g"/>
						<!-- gained by the update: <Function name="Ctrl"/> -->
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	const twoVoltageLevelsXml = /* xml */ `
		<SCL ${ns} ${id}="scd-g">
			<Header id="project-g" uuid="project-g-uuid" ${id}="header-tg"/>
			<Substation name="S1" ${id}="substation-tg">
				<VoltageLevel name="VA" ${id}="voltage-level-a"/>
				<VoltageLevel name="VB" ${id}="voltage-level-b"/>
			</Substation>
		</SCL>
	`

	const typicalRef = { tagName: 'Bay', id: 'bay-g' } as Scl.Ref<'Bay'>
	const voltageLevelA = {
		tagName: 'VoltageLevel',
		id: 'voltage-level-a',
	} as Scl.Ref<'VoltageLevel'>
	const voltageLevelB = {
		tagName: 'VoltageLevel',
		id: 'voltage-level-b',
	} as Scl.Ref<'VoltageLevel'>

	type GainTestCase = TestCase & {
		/** What the template gains: a function its application refers to (default), one it does not, or an application. */
		gain?: 'function-of-application' | 'function' | 'application'
	}

	const testCases: SclTest.TestCases<GainTestCase> = {
		'the typical is placed in two voltage levels, and its application gains a function → each bay gets the function, each application points at the one of its bay, and the function carries no provenance of its own':
			{
				sourceXml: typicalSourceXml,
				targetXml: twoVoltageLevelsXml,
				expectedQueries: [
					'//default:VoltageLevel[@name="VA"]/default:Bay//v2019C1:FunctionRef[@function="S1/VA/B1/Ctrl"][@functionUuid = //default:VoltageLevel[@name="VA"]/default:Bay/default:Function[@name="Ctrl"]/@uuid]',
					'//default:VoltageLevel[@name="VB"]/default:Bay//v2019C1:FunctionRef[@function="S1/VB/B1/Ctrl"][@functionUuid = //default:VoltageLevel[@name="VB"]/default:Bay/default:Function[@name="Ctrl"]/@uuid]',
				],
				unexpectedQueries: [
					'//default:Bay[count(default:Function[@templateUuid="control-g-uuid"]) != 1]',
					// placed as part of the substation template: its provenance is the document's
					'//v2019C1:FunctionSclRef',
				],
			},
		'the typical gains a function no application refers to → each bay gets it, without provenance of its own':
			{
				sourceXml: typicalSourceXml,
				targetXml: twoVoltageLevelsXml,
				gain: 'function',
				expectedQueries: [
					'//default:VoltageLevel[@name="VA"]/default:Bay/default:Function[@name="Ctrl"][@templateUuid="control-g-uuid"]',
					'//default:VoltageLevel[@name="VB"]/default:Bay/default:Function[@name="Ctrl"][@templateUuid="control-g-uuid"]',
				],
				unexpectedQueries: ['//v2019C1:FunctionSclRef'],
			},
		'the typical gains an application → each bay gets it, without provenance of its own': {
			sourceXml: typicalSourceXml,
			targetXml: twoVoltageLevelsXml,
			gain: 'application',
			expectedQueries: [
				'//default:VoltageLevel[@name="VA"]/default:Bay//v2019C1:Application[@name="Display"][@templateUuid="display-g-uuid"]',
				'//default:VoltageLevel[@name="VB"]/default:Bay//v2019C1:Application[@name="Display"][@templateUuid="display-g-uuid"]',
			],
			unexpectedQueries: ['//v2019C1:ApplicationSclRef'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<GainTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: typicalRef,
				targetParent: voltageLevelA,
			})
			await instantiateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: typicalRef,
				targetParent: voltageLevelB,
			})
		})

		await source.transaction(async (tx) => {
			if (testCase.gain === 'application') {
				await tx.addChild(typicalRef, {
					tagName: 'Application',
					attributes: { name: 'Display', type: 'DCS', uuid: 'display-g-uuid' },
				})
				return
			}
			await tx.addChild(typicalRef, {
				tagName: 'Function',
				attributes: { name: 'Ctrl', uuid: 'control-g-uuid' },
			})
			if (testCase.gain === 'function') return
			await tx.addChild(
				{
					tagName: 'FunctionRoleContent',
					id: 'function-role-content-g',
				} as Scl.Ref<'FunctionRoleContent'>,
				{
					tagName: 'FunctionRef',
					attributes: { function: 'TEMPLATE/TEMPLATE/B1/Ctrl', functionUuid: 'control-g-uuid' },
				},
			)
		})

		// the update is started from the first voltage level
		await target.transaction(async (tx) => {
			await updateSsd(tx, {
				sourceQuery: source.query,
				scopeRef: typicalRef,
				targetParent: voltageLevelA,
				scenario: 'template',
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/**
 * A newer bay-typical renames a connectivity node and gains one, with a terminal on it: the
 * instance's terminals name the nodes of the instance, under the project's levels.
 */
describe('update.ssd - connectivity', () => {
	const L1 = '00000000-0000-4000-8000-000000000001'
	const L2 = '00000000-0000-4000-8000-000000000002'
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
						<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="lnode-src-uuid" ${id}="lnode-1"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	const testCases: SclTest.TestCases<TestCase> = {
		'node renamed and node gained in the template → each node keeps the path of its place, the terminals name the instance nodes':
			{
				sourceXml: connectivitySource,
				targetXml,
				expectedQueries: [
					// the instance owns its names: the template's rename does not reach it
					`//default:ConnectivityNode[@templateUuid="${L1}" and @name="L1" and @pathName="S1/V1/B1_1/L1"]`,
					`//default:ConnectivityNode[@templateUuid="${L2}" and @name="L2" and @pathName="S1/V1/B1_1/L2"]`,
					`//default:Terminal[@connectivityNode="S1/V1/B1_1/L1" and @cNodeName="L1" and @cNodeUuid = //default:ConnectivityNode[@templateUuid="${L1}"]/@uuid]`,
					`//default:Terminal[@connectivityNode="S1/V1/B1_1/L2" and @bayName="B1_1" and @cNodeName="L2" and @cNodeUuid = //default:ConnectivityNode[@templateUuid="${L2}"]/@uuid]`,
				],
				unexpectedQueries: [
					`//default:Terminal[@cNodeUuid="${L1}" or @cNodeUuid="${L2}"]`,
					'//default:*[contains(@pathName, "TEMPLATE") or @substationName="TEMPLATE"]',
				],
			},
	}

	async function act({ source, target }: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateSsd(tx, { sourceQuery: source.query, scopeRef, targetParent: bayRef })
		})

		await source.transaction(async (tx) => {
			await tx.update({ tagName: 'ConnectivityNode', id: 'l1' } as Scl.Ref<'ConnectivityNode'>, {
				attributes: { name: 'L9' },
			})
			await tx.addChild(scopeRef, {
				tagName: 'ConnectivityNode',
				// pathName, connectivityNode and the level names are written from the place
				attributes: { name: 'L2', pathName: 'X/X', uuid: L2 },
			})
			await tx.addChild(
				{ tagName: 'ConductingEquipment', id: 'qa1' } as Scl.Ref<'ConductingEquipment'>,
				{
					tagName: 'Terminal',
					attributes: { connectivityNode: 'X/X', cNodeName: 'X', cNodeUuid: L2 },
				},
			)
		})

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
