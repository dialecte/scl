import isdTemplateRevisedGainingAp2 from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-gaining-access-point-ap2.xml?raw'
import isdTemplateRevisedOtherSubnetwork from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-with-other-subnetwork-settings.xml?raw'
import isdTemplateRevisedWithoutPtocDelay from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-without-the-ptoc-delay.xml?raw'
import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import isdTemplateThird from '../integration/ied/fixtures/isd-template-of-a-bay-controller-third-revision-sending-lphd.xml?raw'
import projectNorth from '../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type UpdateCase = SclTest.BaseXmlTestCase & {
	/** The project IED the update starts from, by name. */
	targetIed: string
}

// The update of an S-IED from a newer revision of the template ISD it was placed from: the S-IED reconciled in place,
// its project name kept, a logical node the revision gains added, one it drops removed, the LNode bound to it released.
describe('tx.lifecycle.apply - an S-IED updated from a newer revision of its template ISD', () => {
	const testCases: SclTest.TestCases<UpdateCase> = {
		'BCU1 placed from the first revision, the revision gaining RREC and dropping PTRC → BCU1 keeps its name and uuid, RREC added with its type, PTRC gone, its LNode released':
			{
				// the revision: PTRC (a…024) replaced by RREC (a…026), PTOC setVal 150 (the project keeps its settable 100)
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				targetIed: 'BCU1',
				expectedQueries: [
					'/default:SCL[count(default:IED)=1]/default:IED[@name="BCU1"][@uuid="b0000000-0000-4000-8000-000000000030"][@templateUuid="a0000000-0000-4000-8000-000000000030"]',
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="RREC"][@inst="1"][@lnType="RREC_T"][@templateUuid="a0000000-0000-4000-8000-000000000026"][not(@uuid="a0000000-0000-4000-8000-000000000026")]',
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="RREC_T"][@lnClass="RREC"]/default:DO[@name="Op"]',
					// the settable value the project holds is kept
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTOC"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[.="100"]',
					// a kept logical node keeps its binding
					'//default:Function[@name="LineProtection"]/default:LNode[@lnClass="PTOC"][@iedName="BCU1"][@lnUuid="b0000000-0000-4000-8000-000000000023"]',
					// the LNode bound to the dropped PTRC is released
					'//default:Function[@name="LineProtection"]/default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"][@iedName="None"][not(@lnUuid)]',
					// the revision is recorded on the IED
					'//default:IED[@name="BCU1"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ISD"][@fileUuid="f0000000-0000-4000-8000-000000000001"][@revision="2"]',
				],
				unexpectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTRC"]',
					'//default:IED[@name="SPECIFICATION"]',
				],
			},
		'the third revision adding LPHD1.Proxy.stVal to the Positions data set → the entry names the LPHD of BCU1 by its uuid':
			{
				// the revision's entry names the template's LPHD (a…027); BCU1's LPHD is b…027
				sourceXml: isdTemplateThird,
				targetXml: projectNorth,
				targetIed: 'BCU1',
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:DataSet[@name="Positions"]/default:FCDA[@lnClass="LPHD"][@doName="Proxy"][@ldInst="CTRL"][@lnUuid="b0000000-0000-4000-8000-000000000027"]',
				],
				unexpectedQueries: ['//*[@lnUuid="a0000000-0000-4000-8000-000000000027"]'],
			},
		'the revision with the station bus of type IP at 100 Mb/s → the project keeps its subnetwork settings':
			{
				// the revision's StationBus: type IP, a BitRate; the project's: type 8-MMS, none
				sourceXml: isdTemplateRevisedOtherSubnetwork,
				targetXml: projectNorth,
				targetIed: 'BCU1',
				expectedQueries: [
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@name="StationBus"][@type="8-MMS"][not(default:BitRate)][count(default:ConnectedAP)=1]',
				],
			},
		'the revision gaining the access point AP2 on the station bus → AP2 added to BCU1, its connection naming BCU1 and AP2 by uuid':
			{
				// the revision: AP2 (a…037) and its ConnectedAP beside AP1's
				sourceXml: isdTemplateRevisedGainingAp2,
				targetXml: projectNorth,
				targetIed: 'BCU1',
				expectedQueries: [
					'//default:IED[@name="BCU1"]/default:AccessPoint[@name="AP2"][@templateUuid="a0000000-0000-4000-8000-000000000037"]',
					'/default:SCL/default:Communication/default:SubNetwork[@name="StationBus"][count(default:ConnectedAP)=2]/default:ConnectedAP[@iedName="BCU1"][@apName="AP2"][@apUuid=//default:IED[@name="BCU1"]/default:AccessPoint[@name="AP2"]/@uuid]/default:Address/default:P[.="192.168.0.11"]',
					// AP1's connection keeps the project's address
					'/default:SCL/default:Communication/default:SubNetwork/default:ConnectedAP[@iedName="BCU1"][@apName="AP1"]/default:Address/default:P[.="10.0.1.21"]',
				],
				unexpectedQueries: ['//default:ConnectedAP[@iedName="SPECIFICATION"]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<UpdateCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' }),
			anchor: await projectRoot(target.query),
			scenario: 'template',
			targetInstance: await iedNamed({ query: target.query, name: testCase.targetIed }),
		} as const
		const report = await offered({
			call: function reportUpdate() {
				return target.query.lifecycle.report(lifecycle)
			},
		})
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions: new Map() } })
		})
		// what apply writes is what the report lists: each element listed added names what it became
		const listed = report.instances.flatMap((instance) => [
			instance.tree,
			...instance.groups.flatMap((group) => group.companions),
		])
		expect(listed.flatMap(addedNodes).filter((node) => !node.appliedRef)).toEqual([])
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type DataModelCase = SclTest.BaseXmlTestCase & {
	/** The tag of each element the report lists removed with the logical node's type change. */
	removedWithType: string[]
}

// The IED's data model is the template's: a data instance naming data the type the template now gives its logical node
// no longer holds goes with the type change, listed in the logical node's group.
describe('tx.lifecycle.apply - an S-IED update whose type change drops data the project sets', () => {
	const testCases: SclTest.TestCases<DataModelCase> = {
		'BCU1 setting PTOC1.OpDlTmms.setVal, the revision dropping OpDlTmms from the PTOC type → the DOI listed removed with what it holds in the type change, and gone':
			{
				// the revision's PTOC_T holds Op only, its PTOC sets nothing
				sourceXml: isdTemplateRevisedWithoutPtocDelay,
				targetXml: projectNorth,
				removedWithType: ['DOI', 'DAI', 'Val'],
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTOC"][@uuid="b0000000-0000-4000-8000-000000000023"][not(default:DOI)]',
					// the type it follows holds Op only
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id=//default:IED[@name="BCU1"]//default:LN[@lnClass="PTOC"]/@lnType][count(default:DO)=1]/default:DO[@name="Op"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<DataModelCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' }),
			anchor: await projectRoot(target.query),
			targetInstance: await iedNamed({ query: target.query, name: 'BCU1' }),
		} as const
		const report = await offered({
			call: function reportUpdate() {
				return target.query.lifecycle.report(lifecycle)
			},
		})
		const logicalNodeGroup = report.instances
			.flatMap((instance) => instance.groups)
			.find((group) => group.primary.tagName === 'LN' && group.primary.typeChanges)
		expect(
			(logicalNodeGroup?.companions ?? [])
				.filter((node) => node.change === 'removed')
				.map((node) => node.tagName),
		).toEqual(testCase.removedWithType)
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions: new Map() } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The IED of a document named so. */
async function iedNamed(params: {
	query: Core.Query<Config>
	name: string
}): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.query.findByAttributes({
		tagName: 'IED',
		attributes: { name: params.name },
	})
	if (!ied) throw new Error(`no IED ${params.name}`)
	return { tagName: 'IED', id: ied.id }
}

/** Every node of a report tree listed added, the node itself first. */
function addedNodes(node: DiffNode): DiffNode[] {
	const below = node.children.flatMap((child) => addedNodes(child))
	return node.change === 'added' ? [node, ...below] : below
}

/** The root of the project. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}

/** What a call gives, asserting it is not refused: the update of the IED is offered. */
async function offered<Result>(params: { call: () => Promise<Result> }): Promise<Result> {
	let refusal: string | undefined
	let result: Result | undefined
	try {
		result = await params.call()
	} catch (error) {
		refusal = error instanceof Error ? error.message : String(error)
	}
	expect(refusal).toBeUndefined()
	return result as Result
}
