import isdTemplate from '../integration/ied/fixtures/isd-template-of-a-bay-controller.xml?raw'
import projectSouth from '../integration/ied/fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { AppliedInstances } from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const ns = ALL_XMLNS_NAMESPACES

/**
 * A vendor ICD: the IED TEMPLATE on the subnetwork W1, no uuid anywhere (the import gives each element one, its
 * connection names it by names only), one logical node and its type.
 */
const vendorIcd = /* xml */ `
	<SCL ${ns}>
		<Header id="BCU_VENDOR" fileType="ICD" version="2" revision="B"/>
		<Communication>
			<SubNetwork name="W1" type="8-MMS">
				<ConnectedAP iedName="TEMPLATE" apName="AP1">
					<Address>
						<P type="IP">192.168.1.1</P>
					</Address>
				</ConnectedAP>
			</SubNetwork>
		</Communication>
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

/**
 * A project holding the IED TEMPLATE placed from a vendor ICD earlier, and the IED SPECIFICATION placed from the template
 * ISD, both on the station bus.
 */
const projectHoldingBothNames = /* xml */ `
	<SCL ${ns}>
		<Header id="West" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000040" version="1" revision="A"/>
		<Communication>
			<SubNetwork name="StationBus" type="8-MMS" uuid="d0000000-0000-4000-8000-000000000006">
				<ConnectedAP iedName="TEMPLATE" apName="AP1" apUuid="d0000000-0000-4000-8000-000000000002"/>
				<ConnectedAP iedName="SPECIFICATION" apName="AP1" apUuid="d0000000-0000-4000-8000-000000000031"/>
			</SubNetwork>
		</Communication>
		<IED name="TEMPLATE" manufacturer="Vendor" uuid="d0000000-0000-4000-8000-000000000001">
			<AccessPoint name="AP1" uuid="d0000000-0000-4000-8000-000000000002"/>
		</IED>
		<IED name="SPECIFICATION" templateUuid="a0000000-0000-4000-8000-000000000030" uuid="d0000000-0000-4000-8000-000000000030">
			<AccessPoint name="AP1" templateUuid="a0000000-0000-4000-8000-000000000031" uuid="d0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

/**
 * A vendor ICD of two IEDs: TEMPLATE with an access point on W1 and one on W2, and OTHER beside it on W1 (written by
 * names only; the import gives each connection the uuid of the access point it names).
 */
const vendorIcdOfTwoIeds = /* xml */ `
	<SCL ${ns}>
		<Header id="V2" fileType="ICD" version="1" revision="A"/>
		<Communication>
			<SubNetwork name="W1" type="8-MMS">
				<ConnectedAP iedName="OTHER" apName="AP1"><Address><P type="IP">10.0.0.9</P></Address></ConnectedAP>
				<ConnectedAP iedName="TEMPLATE" apName="AP1"><Address><P type="IP">10.0.0.1</P></Address></ConnectedAP>
			</SubNetwork>
			<SubNetwork name="W2" type="8-MMS">
				<ConnectedAP iedName="TEMPLATE" apName="AP2"><Address><P type="IP">10.0.1.1</P></Address></ConnectedAP>
			</SubNetwork>
		</Communication>
		<IED name="TEMPLATE" manufacturer="Vendor">
			<AccessPoint name="AP1"><Server><Authentication/><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="" lnType="V_LLN0"/></LDevice></Server></AccessPoint>
			<AccessPoint name="AP2"><Server><Authentication/><LDevice inst="LD1"><LN0 lnClass="LLN0" inst="" lnType="V_LLN0"/></LDevice></Server></AccessPoint>
		</IED>
		<IED name="OTHER" manufacturer="Vendor">
			<AccessPoint name="AP1"><Server><Authentication/><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="" lnType="V_LLN0"/></LDevice></Server></AccessPoint>
		</IED>
		<DataTypeTemplates>
			<LNodeType id="V_LLN0" lnClass="LLN0"><DO name="Beh" type="V_ENS"/></LNodeType>
			<DOType id="V_ENS" cdc="ENS"><DA name="stVal" bType="Enum" type="V_Beh" fc="ST"/></DOType>
			<EnumType id="V_Beh"><EnumVal ord="1">on</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

/** A project with the subnetwork W1 only, X on it. */
const projectOnW1 = /* xml */ `
	<SCL ${ns}>
		<Header id="P" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000070" version="1" revision="A"/>
		<Communication>
			<SubNetwork name="W1" type="8-MMS" uuid="e0000000-0000-4000-8000-000000000001">
				<ConnectedAP iedName="X" apName="S1" apUuid="e0000000-0000-4000-8000-000000000003"/>
			</SubNetwork>
		</Communication>
		<IED name="X" manufacturer="M" uuid="e0000000-0000-4000-8000-000000000002">
			<AccessPoint name="S1" uuid="e0000000-0000-4000-8000-000000000003"/>
		</IED>
	</SCL>
`

/** A project with no IED and no Communication yet. */
const projectEmpty = /* xml */ `
	<SCL ${ns}>
		<Header id="East" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000050" version="1" revision="A"/>
	</SCL>
`

type PlacementCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	/** The IED group skipped in the review. Absent: every group at its suggested action. */
	skipIed?: boolean
	/** The name the consumer gives the placed IED in its own step. Absent: no step. */
	renameTo?: string
	scenario?: LifecycleScenario
	/** The IED of the source placed, by name. Absent: the one IED it holds. */
	iedName?: string
}

// The first placement of an IED a report lists: the IED written as a new one under the project's root, with the data
// types its logical nodes use and the file it came from, its connections under the project's subnetwork of the same
// name (the subnetwork and the Communication added when missing); a name another IED holds numbered, the connections
// naming it as placed; nothing written when its group is skipped. What apply writes is what the report lists: every
// element the report lists added is written, and only those (`expectedQueries` count them).
describe('tx.lifecycle.apply - the first placement of an IED', () => {
	const testCases: SclTest.TestCases<PlacementCase> = {
		'the template ISD placed in project South → the IED SPECIFICATION written beside R1, its uuids its own, the template its lineage, its types and the ISD it came from':
			{
				sourceXml: isdTemplate,
				targetXml: projectSouth,
				sourceFileName: 'BCU_Template.isd',
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="R1"][@uuid="c0000000-0000-4000-8000-000000000030"]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"][@name="SPECIFICATION"][@manufacturer="ISSUER"][@uuid][not(@uuid="a0000000-0000-4000-8000-000000000030")]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ISD"][@fileName="BCU_Template.isd"][@fileUuid="f0000000-0000-4000-8000-000000000001"][@version="0"][@revision="1"]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]/default:AccessPoint[@name="AP1"][@templateUuid="a0000000-0000-4000-8000-000000000031"][not(@uuid="a0000000-0000-4000-8000-000000000031")]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="CSWI"][@templateUuid="a0000000-0000-4000-8000-000000000021"]',
					// the data set names the logical node placed, not the template's
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:FCDA[@lnClass="CSWI"][@lnUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="CSWI"]/@uuid]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]//default:LN[@lnClass="PTOC"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[.="100"]',
					'/default:SCL/default:DataTypeTemplates[count(default:LNodeType)=8][count(default:DOType)=5][count(default:EnumType)=1]',
					// the template's ACT_T is the project's R1_ACT: the project's type is used, under its own id
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="PTOC_T"]/default:DO[@name="Op"][@type="R1_ACT"]',
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="R1_PDIF"]',
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="CSWI_T"][@lnClass="CSWI"]/default:DO[@name="Pos"][@type="DPC_T"]',
					'/default:SCL/default:DataTypeTemplates/default:DOType[@id="ING_T"]/default:DA[@name="setVal"][@bType="INT32"]',
					// the connection of its access point, on the station bus the project holds, beside R1's
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][@uuid="c0000000-0000-4000-8000-000000000006"][count(default:ConnectedAP)=2]/default:ConnectedAP[@iedName="R1"][@apName="S1"]',
					'/default:SCL/default:Communication/default:SubNetwork/default:ConnectedAP[@iedName="SPECIFICATION"][@apName="AP1"][@apUuid=//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"]/default:AccessPoint/@uuid]/default:Address/default:P[@type="IP"][.="192.168.0.10"]',
				],
				unexpectedQueries: [
					'//*[@uuid="a0000000-0000-4000-8000-000000000030"]',
					'//default:DOType[@id="ACT_T"]',
				],
			},
		'the template ISD placed again where an IED SPECIFICATION was placed from it → a second IED, numbered, the first left as it is':
			{
				sourceXml: isdTemplate,
				targetXml: projectHoldingBothNames,
				sourceFileName: 'BCU_Template.isd',
				scenario: 'instantiate',
				expectedQueries: [
					'/default:SCL[count(//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"])=2]/default:IED[@name="SPECIFICATION"][@uuid="d0000000-0000-4000-8000-000000000030"][not(default:IEDSourceFiles)][not(default:MinRequestedSCDFiles)]',
					// the project file is recorded on the IED placed, not on the one of its name
					'//default:IED[@name="SPECIFICATION_1"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="f0000000-0000-4000-8000-000000000040"]',
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"][@name="SPECIFICATION_1"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ISD"]',
					// its own connection beside the first one's, naming it as numbered
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=3]/default:ConnectedAP[@iedName="SPECIFICATION"][@apUuid="d0000000-0000-4000-8000-000000000031"]',
					'/default:SCL/default:Communication/default:SubNetwork/default:ConnectedAP[@iedName="SPECIFICATION_1"][@apName="AP1"][@apUuid=//default:IED[@name="SPECIFICATION_1"]/default:AccessPoint/@uuid]/default:Address/default:P[.="192.168.0.10"]',
				],
			},
		'a vendor ICD whose IED TEMPLATE the project already holds → a new IED, numbered, the ICD it came from':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingBothNames,
				sourceFileName: 'BCU_Vendor.icd',
				expectedQueries: [
					'/default:SCL[count(default:IED)=3]/default:IED[@name="TEMPLATE"][@uuid="d0000000-0000-4000-8000-000000000001"][not(default:IEDSourceFiles)][not(default:MinRequestedSCDFiles)]',
					'/default:SCL/default:IED[@name="TEMPLATE_1"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="f0000000-0000-4000-8000-000000000040"]',
					'/default:SCL/default:IED[@name="TEMPLATE_1"][@manufacturer="Vendor"]/default:IEDSourceFiles[count(default:SclFileReference)=1]/default:SclFileReference[@fileType="ICD"][@fileName="BCU_Vendor.icd"][@version="2"][@revision="B"]',
					'/default:SCL/default:IED[@name="TEMPLATE_1"]/default:AccessPoint[@name="AP1"]//default:LN0[@lnType="V_LLN0"]',
					'/default:SCL/default:DataTypeTemplates/default:EnumType[@id="V_Beh"]/default:EnumVal[@ord="1"]',
					// its subnetwork W1 added beside the station bus, its connection naming the IED as numbered
					'/default:SCL/default:Communication[count(default:SubNetwork)=2]/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=2]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"][@type="8-MMS"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="TEMPLATE_1"][@apName="AP1"]/default:Address/default:P[.="192.168.1.1"]',
					// the connection the vendor wrote by names only, given its uuid by the import, names the placed access point
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"]/default:ConnectedAP[@iedName="TEMPLATE_1"][@apUuid=//default:IED[@name="TEMPLATE_1"]/default:AccessPoint/@uuid]',
				],
			},
		'an ICD whose IED is on two subnetworks, the project on one of them, another IED of the file beside it → its connections under the project W1 and under W2 added, the other IED not written':
			{
				sourceXml: vendorIcdOfTwoIeds,
				targetXml: projectOnW1,
				sourceFileName: 'BCU_Vendor.icd',
				iedName: 'TEMPLATE',
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:Communication[count(default:SubNetwork)=2]/default:SubNetwork[@name="W1"][@uuid="e0000000-0000-4000-8000-000000000001"][count(default:ConnectedAP)=2]/default:ConnectedAP[@iedName="TEMPLATE"][@apName="AP1"][@apUuid=//default:IED[@name="TEMPLATE"]/default:AccessPoint[@name="AP1"]/@uuid]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="W2"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="TEMPLATE"][@apName="AP2"]/default:Address/default:P[.="10.0.1.1"]',
				],
				unexpectedQueries: [
					'//default:ConnectedAP[@iedName="OTHER"]',
					'//default:IED[@name="OTHER"]',
				],
			},
		"the template ISD placed as a fork in project South → the IED with the file's uuids, no lineage and no source file recorded, its connection naming its access point":
			{
				sourceXml: isdTemplate,
				targetXml: projectSouth,
				sourceFileName: 'BCU_Template.isd',
				scenario: 'fork',
				expectedQueries: [
					'/default:SCL/default:IED[@uuid="a0000000-0000-4000-8000-000000000030"][@name="SPECIFICATION"][not(@templateUuid)][not(default:IEDSourceFiles)]/default:AccessPoint[@uuid="a0000000-0000-4000-8000-000000000031"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=2]/default:ConnectedAP[@iedName="SPECIFICATION"][@apUuid="a0000000-0000-4000-8000-000000000031"]',
				],
			},
		'the IED group skipped in the review → nothing written, the project as it was': {
			sourceXml: isdTemplate,
			targetXml: projectSouth,
			sourceFileName: 'BCU_Template.isd',
			skipIed: true,
			expectedQueries: [
				'/default:SCL[count(default:IED)=1][not(default:DataTypeTemplates/default:LNodeType[@id="CSWI_T"])]/default:Communication/default:SubNetwork[count(default:ConnectedAP)=1]',
			],
		},
		'the consumer naming the IED placed in its own step, in a project with no Communication → the IED BCU1 handed to it and named, the Communication added, its connection naming BCU1':
			{
				sourceXml: isdTemplate,
				targetXml: projectEmpty,
				sourceFileName: 'BCU_Template.isd',
				renameTo: 'BCU1',
				expectedQueries: [
					'//default:IED[@templateUuid="a0000000-0000-4000-8000-000000000030"][@name="BCU1"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"][@templateUuid="a0000000-0000-4000-8000-000000000006"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="BCU1"][@apName="AP1"]',
				],
				unexpectedQueries: ['//default:IED[@name="SPECIFICATION"]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<PlacementCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: testCase.sourceFileName,
		})
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed({ sourceQuery, name: testCase.iedName }),
			anchor: await projectRoot(target.query),
			scenario: testCase.scenario,
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		// a first placement is on the fast track, whatever the project holds
		expect(report.needsDecisions).toBe(false)
		const [iedGroup] = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(testCase.skipIed && iedGroup ? [[iedGroup.id, 'skip' as const]] : [])
		const renameTo = testCase.renameTo
		await target.transaction(async function applyIed(tx) {
			await tx.lifecycle.apply({
				...lifecycle,
				report,
				resolution: {
					decisions,
					...(renameTo ? { afterApply: nameEachIed({ name: renameTo }) } : {}),
				},
			})
		})
		// each element the report lists added is written: it names what it became
		const listed = report.instances.flatMap((instance) => [
			instance.tree,
			...instance.groups.flatMap((group) => group.companions),
		])
		const added = listed.flatMap((node) => addedNodes(node))
		expect(added.filter((node) => !node.appliedRef).map((node) => node.tagName)).toEqual(
			testCase.skipIed ? added.map((node) => node.tagName) : [],
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type NamesOnlyCase = SclTest.BaseXmlTestCase & { sourceFileName: string }

// A source whose connections name their access point by names only (written so through the API, the import gives them
// the uuid): each placed connection is given the placed access point's uuid before the IED is numbered, so the project
// file is recorded on the IED placed, never on the IED of the project holding the source's name.
describe('tx.lifecycle.apply - the first placement of an IED whose connections name their access point by names only', () => {
	const testCases: SclTest.TestCases<NamesOnlyCase> = {
		'the vendor ICD, its connection stripped of its uuid, where the project holds an IED TEMPLATE → the connection names the placed access point, the project IED TEMPLATE records no project file':
			{
				sourceXml: vendorIcd,
				targetXml: projectHoldingBothNames,
				sourceFileName: 'BCU_Vendor.icd',
				expectedQueries: [
					'/default:SCL/default:IED[@name="TEMPLATE"][@uuid="d0000000-0000-4000-8000-000000000001"][not(default:MinRequestedSCDFiles)]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="W1"]/default:ConnectedAP[@iedName="TEMPLATE_1"][@apUuid=//default:IED[@name="TEMPLATE_1"]/default:AccessPoint/@uuid]',
					'/default:SCL/default:IED[@name="TEMPLATE_1"]/default:MinRequestedSCDFiles/default:MinRequestedSCDFile[@fileUuid="f0000000-0000-4000-8000-000000000040"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<NamesOnlyCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], testCase.sourceFileName, { type: 'text/xml' }),
		)
		const source = project.openDocument(imported.documentId)
		await source.transaction(async function nameByNamesOnly(tx) {
			const connections = await tx.getRecordsByTagName('ConnectedAP')
			for (const connection of connections) {
				await tx.update(
					{ tagName: 'ConnectedAP', id: connection.id },
					{ attributes: { apUuid: undefined } },
				)
			}
		})
		const lifecycle = {
			verb: 'ied',
			sourceQuery: source.query,
			ref: await onlyIed({ sourceQuery: source.query }),
			anchor: await projectRoot(target.query),
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		await target.transaction(async function applyIed(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type RefusalCase = SclTest.BaseXmlTestCase & {
	sourceFileName: string
	expected: { key: string; meta: Record<string, unknown> }
}

// A report of a first placement applied again once the IED it places is in the project is refused before anything is
// written: `template` then finds the IED, and the report was made for no update of it.
describe('tx.lifecycle.apply - a placement report applied once the IED is placed', () => {
	const testCases: SclTest.TestCases<RefusalCase> = {
		'the report of the template ISD applied a second time in the transaction that placed it → refused, the report made for no update of the IED placed, the second write staged nothing':
			{
				sourceXml: isdTemplate,
				targetXml: projectSouth,
				sourceFileName: 'BCU_Template.isd',
				expected: { key: 'REPORT_TARGET_MISMATCH', meta: { field: 'targetInstance' } },
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<RefusalCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const sourceQuery = await importSource({
			project,
			xml: testCase.sourceXml,
			fileName: testCase.sourceFileName,
		})
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed({ sourceQuery }),
			anchor: await projectRoot(target.query),
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		const outcome = await target.transaction(async function applyTwice(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report })
			const staged = tx.getStagedOperations().length
			const refusal = await tx.lifecycle.apply({ ...lifecycle, report }).then(
				() => undefined,
				(error: unknown) => toDialecteError(error),
			)
			return { refusal, stagedBySecond: tx.getStagedOperations().length - staged }
		})
		expect({ key: outcome.refusal?.key, meta: outcome.refusal?.meta }).toEqual(testCase.expected)
		expect(outcome.stagedBySecond).toBe(0)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The source file opened in the test project under its name: its extension is the type of file the IED comes from. */
async function importSource(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	xml: string
	fileName: string
}): Promise<Core.Query<Config>> {
	const { project, xml, fileName } = params
	const imported = await project.importFile(new File([xml], fileName, { type: 'text/xml' }))
	return project.openDocument(imported.documentId).query
}

/** The IED of a source file of that name, else the one it holds. */
async function onlyIed(params: {
	sourceQuery: Core.Query<Config>
	name?: string
}): Promise<Scl.Ref<'IED'>> {
	const ieds = await params.sourceQuery.getRecordsByTagName('IED')
	const ied = params.name
		? ieds.find((record) => readAttribute({ record, name: 'name' }) === params.name)
		: ieds[0]
	if (!ied) throw new Error('the source holds no such IED')
	return { tagName: 'IED', id: ied.id }
}

/** Every node of a report tree listed added, the node itself first. */
function addedNodes(node: DiffNode): DiffNode[] {
	const below = node.children.flatMap((child) => addedNodes(child))
	return node.change === 'added' ? [node, ...below] : below
}

/** The root of the project the IED is placed under. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}

/** A consumer step naming each IED the apply placed. */
function nameEachIed(params: { name: string }) {
	return async function nameIed(
		tx: Scl.Transaction,
		step: { instances: AppliedInstances },
	): Promise<void> {
		if (step.instances.verb !== 'ied') return
		for (const { ref } of step.instances.ieds)
			await tx.update(ref, { attributes: { name: params.name } })
	}
}
