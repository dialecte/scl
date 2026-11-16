import isdTemplateWithBayVariable from '../integration/ied/fixtures/isd-template-of-a-bay-controller-with-a-bay-variable.xml?raw'
import isdTemplate from '../integration/ied/fixtures/isd-template-of-a-bay-controller.xml?raw'
import projectNorth from '../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'
import projectSouthHoldingVariableCopy from '../integration/ied/fixtures/project-south-with-q01-holding-the-bay-variable-copy.xml?raw'
import projectSouth from '../integration/ied/fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const ns = ALL_XMLNS_NAMESPACES

/** A project holding the IED SPECIFICATION placed from the template ISD earlier (no substation, no specification). */
const projectHoldingSpecification = /* xml */ `
	<SCL ${ns}>
		<Header id="West" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000040" version="1" revision="A"/>
		<IED name="SPECIFICATION" templateUuid="a0000000-0000-4000-8000-000000000030" uuid="d0000000-0000-4000-8000-000000000030">
			<AccessPoint name="AP1" templateUuid="a0000000-0000-4000-8000-000000000031" uuid="d0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

/** A vendor ICD whose IED TEMPLATE comes with a substation section: a bay holding one function. No uuid anywhere. */
const vendorIcdWithSubstation = /* xml */ `
	<SCL ${ns}>
		<Header id="BCU_VENDOR" fileType="ICD" version="2" revision="B"/>
		<Substation name="S1">
			<VoltageLevel name="V1">
				<Bay name="B1">
					<Function name="Control"/>
				</Bay>
			</VoltageLevel>
		</Substation>
		<IED name="TEMPLATE" manufacturer="Vendor">
			<AccessPoint name="AP1">
				<Server>
					<Authentication/>
					<LDevice inst="LD0">
						<LN0 lnClass="LLN0" inst="" lnType="V_LLN0"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates>
			<LNodeType id="V_LLN0" lnClass="LLN0">
				<DO name="Beh" type="V_ENS"/>
			</LNodeType>
			<DOType id="V_ENS" cdc="ENS">
				<DA name="stVal" bType="Enum" type="V_Beh" fc="ST"/>
			</DOType>
			<EnumType id="V_Beh">
				<EnumVal ord="1">on</EnumVal>
			</EnumType>
		</DataTypeTemplates>
	</SCL>
`

type SpecificationCase = SclTest.BaseXmlTestCase & {
	scenario?: LifecycleScenario
	/** The project bay the template's TEMPLATE bay is mapped onto, by name. Absent: no choice made. */
	bayOnto?: string
}

// A template ISD carries its specification beside its IED: a TEMPLATE substation, voltage level and bay holding the
// functions whose LNodes the IED implements. Placing it places that specification with the IED: the bay lands where
// the consumer maps it (a new bay, named for its kind, when nothing is chosen), each LNode bound to the logical node of the
// IED placed with it and specified on that IED; the source file is recorded on the IED only. What apply writes is what
// the report lists (every element the report lists added is written).
describe('tx.lifecycle.apply - the specification a template ISD carries, placed with its IED', () => {
	const testCases: SclTest.TestCases<SpecificationCase> = {
		'the template ISD placed in South, its TEMPLATE bay mapped onto Q01 → its two functions in Q01, each LNode bound to the IED placed and specified on it':
			{
				// South: one substation, one voltage level E1, Q01 empty, R1 in Q02
				sourceXml: isdTemplate,
				targetXml: projectSouth,
				bayOnto: 'Q01',
				expectedQueries: [
					'/default:SCL[count(default:Substation)=1]/default:Substation[@name="South"]/default:VoltageLevel[@name="E1"][count(default:Bay)=2]/default:Bay[@name="Q01"][@uuid="c0000000-0000-4000-8000-000000000003"][not(@templateUuid)][count(default:Function)=2]/default:Function[@name="BayControl"][@templateUuid="a0000000-0000-4000-8000-000000000004"][not(@uuid="a0000000-0000-4000-8000-000000000004")][count(default:LNode)=2]',
					'//default:Bay[@name="Q01"]/default:Function[@name="BayControl"]/default:LNode[@lnClass="CSWI"][@lnInst="1"][@iedName="SPECIFICATION"][@ldInst="CTRL"][@templateUuid="a0000000-0000-4000-8000-000000000011"][@lnUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="CSWI"]/@uuid]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION"][@sLdInst="CTRL"][@sLnClass="CSWI"][@sLnInst="1"]',
					'//default:Bay[@name="Q01"]/default:Function[@name="BayControl"]/default:LNode[@lnClass="CILO"][@iedName="SPECIFICATION"][@lnUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="CILO"]/@uuid]',
					'//default:Bay[@name="Q01"]/default:Function[@name="LineProtection"][@templateUuid="a0000000-0000-4000-8000-000000000005"][count(default:LNode)=2]/default:LNode[@lnClass="PTOC"][@iedName="SPECIFICATION"][@ldInst="PROT"][@lnUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="PTOC"]/@uuid]',
					'//default:Bay[@name="Q01"]/default:Function[@name="LineProtection"]/default:LNode[@lnClass="PTRC"][@lnUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="PTRC"]/@uuid]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION"][@sLdInst="PROT"]',
					// the ISD is recorded on the IED placed, not at the project's header
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ISD"][@fileUuid="f0000000-0000-4000-8000-000000000001"]',
				],
				unexpectedQueries: [
					'//*[@name="TEMPLATE"]',
					'//*[@uuid="a0000000-0000-4000-8000-000000000004"]',
					'//default:LNode[starts-with(@lnUuid, "a0000000")]',
					'/default:SCL/default:Header/default:SourceFiles',
				],
			},
		'the template ISD placed in South, no bay chosen → a new bay in E1, named for its kind, holding its functions, Q01 left empty':
			{
				// South's only substation and voltage level take the template's; its TEMPLATE bay has no counterpart and is created
				sourceXml: isdTemplate,
				targetXml: projectSouth,
				expectedQueries: [
					'/default:SCL[count(default:Substation)=1]/default:Substation[@name="South"][count(default:VoltageLevel)=1]/default:VoltageLevel[@name="E1"][count(default:Bay)=3]/default:Bay[@name="Q01"][not(*)]',
					'//default:VoltageLevel[@name="E1"]/default:Bay[@name="Bay"][@templateUuid="a0000000-0000-4000-8000-000000000003"][count(default:Function)=2]/default:Function[@name="BayControl"]/default:LNode[@lnClass="CSWI"][@iedName="SPECIFICATION"][@lnUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="CSWI"]/@uuid]',
					'//default:Bay[@name="Bay"]/default:Function[@name="LineProtection"][count(default:LNode[@iedName="SPECIFICATION"])=2]',
				],
				unexpectedQueries: [
					'//*[@name="TEMPLATE"]',
					'//default:LNode[starts-with(@lnUuid, "a0000000")]',
				],
			},
		'the template ISD placed again in North, where BCU1 was placed from it, its bay mapped onto Q01 → a second IED and its own functions beside BCU1, nothing of BCU1 taken over':
			{
				// North: Q01 holds BayControl and LineProtection of BCU1, placed from the template's first revision
				sourceXml: isdTemplate,
				targetXml: projectNorth,
				scenario: 'instantiate',
				bayOnto: 'Q01',
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="BCU1"][@uuid="b0000000-0000-4000-8000-000000000030"]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"][@name="SPECIFICATION"][not(@uuid="b0000000-0000-4000-8000-000000000030")]',
					'//default:Bay[@name="Q01"][count(default:Function)=4][count(default:Function[@templateUuid="a0000000-0000-4000-8000-000000000004"])=2]/default:Function[@name="BayControl"][@uuid="b0000000-0000-4000-8000-000000000004"][count(default:LNode[@iedName="BCU1"])=2]',
					'//default:Bay[@name="Q01"]/default:Function[not(@name="BayControl")][@templateUuid="a0000000-0000-4000-8000-000000000004"][count(default:LNode)=2]/default:LNode[@lnClass="CSWI"][@iedName="SPECIFICATION"][@lnUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="CSWI"]/@uuid]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION"]',
					'//default:Bay[@name="Q01"]/default:Function[@name="LineProtection"][@uuid="b0000000-0000-4000-8000-000000000005"]/default:LNode[@lnClass="PTRC"][@iedName="BCU1"][@lnUuid="b0000000-0000-4000-8000-000000000024"]',
				],
				unexpectedQueries: ['//default:LNode[starts-with(@lnUuid, "a0000000")]'],
			},
		'the template ISD placed where an IED SPECIFICATION was placed from it → SPECIFICATION_1, its LNodes and their specification naming it, nothing of the first IED taken over':
			{
				// the project holds the first placement's IED (named SPECIFICATION) and no substation
				sourceXml: isdTemplate,
				targetXml: projectHoldingSpecification,
				scenario: 'instantiate',
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="SPECIFICATION"][@uuid="d0000000-0000-4000-8000-000000000030"]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"][@name="SPECIFICATION_1"][not(@uuid="d0000000-0000-4000-8000-000000000030")]',
					'//default:Function[@name="BayControl"][count(default:LNode[@iedName="SPECIFICATION_1"])=2]/default:LNode[@lnClass="CSWI"][@lnUuid=//default:IED[@name="SPECIFICATION_1"]//default:LN[@lnClass="CSWI"]/@uuid]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION_1"]',
					'//default:Function[@name="LineProtection"][count(default:LNode[@iedName="SPECIFICATION_1"])=2]',
				],
				unexpectedQueries: [
					'//default:LNode[@iedName="SPECIFICATION"]',
					'//v2019C1:LNodeSpecNaming[@sIedName="SPECIFICATION"]',
				],
			},
		"the template ISD whose bay holds a variable, its bay mapped onto Q01 holding that variable's copy → the copy stands for it, no variable written without what it applies to":
			{
				// the template bay's VBAY applies to the bay; South's Q01 holds its copy (templateUuid = VBAY's uuid)
				sourceXml: isdTemplateWithBayVariable,
				targetXml: projectSouthHoldingVariableCopy,
				bayOnto: 'Q01',
				expectedQueries: [
					'//default:Bay[@name="Q01"][count(default:Private/v2019C1:Variable)=1][count(default:Function)=2]/default:Private/v2019C1:Variable[@name="VBAY"][@uuid="c0000000-0000-4000-8000-000000000040"][@value="9"]/v2019C1:VariableApplyTo[@elementUuid="c0000000-0000-4000-8000-000000000003"]',
				],
				unexpectedQueries: ['//v2019C1:Variable[not(v2019C1:VariableApplyTo)]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SpecificationCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({ project, xml: testCase.sourceXml })
		const mappings = await bayMapping({
			sourceQuery,
			targetQuery: target.query,
			bayOnto: testCase.bayOnto,
		})
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed(sourceQuery),
			anchor: await projectRoot(target.query),
			scenario: testCase.scenario,
		} as const
		const reported = target.query.lifecycle.report({ ...lifecycle, resolution: { mappings } })
		// where the consumer maps the bay is a choice the report takes
		await expect(reported).resolves.toBeDefined()
		const report = await reported
		await target.transaction(async function applyIsd(tx) {
			await tx.lifecycle.apply({
				...lifecycle,
				report,
				resolution: { decisions: new Map(), mappings },
			})
		})
		// each element the report lists added is written: it names what it became
		const listed = report.instances.flatMap((instance) =>
			instance.groups.map((group) => group.primary),
		)
		const notWritten = listed.flatMap((node) => addedNodes(node)).filter((node) => !node.appliedRef)
		expect(notWritten.map((node) => node.tagName)).toEqual([])
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type LeftOutCase = SclTest.BaseXmlTestCase

// The consumer skips every group of the specification in the review: the IED is placed alone.
describe('tx.lifecycle.apply - a template ISD whose specification the consumer leaves out', () => {
	const testCases: SclTest.TestCases<LeftOutCase> = {
		'the template ISD placed in South, every group but the IED skipped → the IED alone, nothing of its specification':
			{
				// South: Q01 empty; every group of the specification is skipped in the review
				sourceXml: isdTemplate,
				targetXml: projectSouth,
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"][@name="SPECIFICATION"]',
					'//default:VoltageLevel[@name="E1"][count(default:Bay)=2]/default:Bay[@name="Q01"][not(*)]',
				],
				unexpectedQueries: ['//default:Function[@name="BayControl" or @name="LineProtection"]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<LeftOutCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({ project, xml: testCase.sourceXml })
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed(sourceQuery),
			anchor: await projectRoot(target.query),
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		const specificationGroups = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.primary.tagName !== 'IED')
		const decisions: DecisionMap = new Map(
			specificationGroups.map((group) => [group.id, 'skip'] as const),
		)
		await target.transaction(async function applyIedAlone(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type IcdCase = SclTest.BaseXmlTestCase

// An ICD's substation section is no specification of its IED: placing the ICD's IED leaves it out.
describe('tx.lifecycle.apply - an ICD carrying a substation section', () => {
	const testCases: SclTest.TestCases<IcdCase> = {
		'a vendor ICD whose file holds a bay with a function, placed in South → its IED alone, nothing of its substation section':
			{
				// South holds substation South only; the ICD's S1 / V1 / B1 is no specification
				sourceXml: vendorIcdWithSubstation,
				targetXml: projectSouth,
				expectedQueries: [
					'/default:SCL[count(default:IED)=2][count(default:Substation)=1]/default:IED[@name="TEMPLATE"][@manufacturer="Vendor"]',
				],
				unexpectedQueries: [
					'//default:Substation[@name="S1"]',
					'//default:Function[@name="Control"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<IcdCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_VENDOR.icd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed(sourceQuery),
			anchor: await projectRoot(target.query),
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		// the report lists the IED alone, as apply writes it
		expect(report.instances.map((instance) => instance.tree.tagName)).toEqual(['IED'])
		await target.transaction(async function applyIcd(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type UndecidedCase = SclTest.BaseXmlTestCase

// A level of the specification the project holds several of, and the consumer chose none of: where the specification
// lands is the consumer's to decide. The report says so, and apply without decisions writes nothing.
describe('tx.lifecycle.report - a template ISD whose voltage level the project holds two of', () => {
	const testCases: SclTest.TestCases<UndecidedCase> = {
		'the template ISD and a project with E1 and E2 → the report needs a decision, apply without one writes nothing':
			{
				sourceXml: isdTemplate,
				targetXml: /* xml */ `
					<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="C" release="5">
						<Header id="Two" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000060" version="1" revision="A"/>
						<Substation name="South" uuid="e0000000-0000-4000-8000-000000000001">
							<VoltageLevel name="E1" uuid="e0000000-0000-4000-8000-000000000002"/>
							<VoltageLevel name="E2" uuid="e0000000-0000-4000-8000-000000000003"/>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'/default:SCL[not(default:IED)]/default:Substation[count(default:VoltageLevel)=2]/default:VoltageLevel[not(*)]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<UndecidedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({ project, xml: testCase.sourceXml })
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed(sourceQuery),
			anchor: await projectRoot(target.query),
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		expect(report.needsDecisions).toBe(true)
		expect(
			report.mappings.filter((mapping) => !mapping.mapping).map((mapping) => mapping.tagName),
		).toEqual([
			'VoltageLevel',
			// the bay below waits for where its voltage level lands
			'Bay',
		])
		await target.transaction(async function applyUndecided(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

async function importSource(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	xml: string
}): Promise<Core.Query<Config>> {
	const imported = await params.project.importFile(
		new File([params.xml], 'BCU_Template.isd', { type: 'text/xml' }),
	)
	return params.project.openDocument(imported.documentId).query
}

async function onlyIed(sourceQuery: Core.Query<Config>): Promise<Scl.Ref<'IED'>> {
	const [ied] = await sourceQuery.getRecordsByTagName('IED')
	return { tagName: 'IED', id: ied.id }
}

async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const [root] = await query.getRecordsByTagName('SCL')
	return { tagName: 'SCL', id: root.id }
}

/** The consumer's choice for the template's TEMPLATE bay: the project bay of that name. */
async function bayMapping(params: {
	sourceQuery: Core.Query<Config>
	targetQuery: Core.Query<Config>
	bayOnto: string | undefined
}): Promise<DecisionMappings> {
	const { sourceQuery, targetQuery, bayOnto } = params
	if (!bayOnto) return new Map()
	const [templateBay] = await sourceQuery.getRecordsByTagName('Bay')
	const projectBays = await targetQuery.getRecordsByTagName('Bay')
	const onto = projectBays.find((bay) => readAttribute({ record: bay, name: 'name' }) === bayOnto)
	if (!onto) throw new Error('the project holds no bay of the name chosen')
	return new Map([[templateBay.id, { existing: { tagName: 'Bay', id: onto.id } }]])
}

function addedNodes(node: DiffNode): DiffNode[] {
	const own = node.change === 'added' ? [node] : []
	return [...own, ...node.children.flatMap((child) => addedNodes(child))]
}
