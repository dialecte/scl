import isdInstanceOfBcu1 from '../integration/ied/fixtures/isd-instance-of-bcu1-from-project-north.xml?raw'
import projectSouth from '../integration/ied/fixtures/project-south-with-relay-r1-and-bay-q01-to-place-into.xml?raw'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const ns = ALL_XMLNS_NAMESPACES

/** A project holding another IED named BCU1 (its own uuid), on its station bus, and no substation. */
const projectWithAnotherBcu1 = /* xml */ `
	<SCL ${ns}>
		<Header id="West" fileType="SCD" uuid="f0000000-0000-4000-8000-000000000080" version="1" revision="A"/>
		<Communication>
			<SubNetwork name="StationBus" type="8-MMS" uuid="e0000000-0000-4000-8000-000000000006">
				<ConnectedAP iedName="BCU1" apName="S1" apUuid="e0000000-0000-4000-8000-000000000031"/>
			</SubNetwork>
		</Communication>
		<IED name="BCU1" manufacturer="Supplier" uuid="e0000000-0000-4000-8000-000000000030">
			<AccessPoint name="S1" uuid="e0000000-0000-4000-8000-000000000031"/>
		</IED>
	</SCL>
`

/** A project holding the instance's subnetwork StationBus, by its uuid, and nothing else. */
const projectHoldingTheSubNetwork = /* xml */ `
	<SCL ${ns}>
		<Header id="North" fileType="SSD" uuid="f0000000-0000-4000-8000-000000000020" version="4" revision="A"/>
		<Communication>
			<SubNetwork name="StationBus" type="8-MMS" uuid="b0000000-0000-4000-8000-000000000006"/>
		</Communication>
	</SCL>
`

// An ISD instance file (its IED named for the project it was exported from) placed as a fork: its IED and its
// specification keep the identity the file gives them (uuids and lineage as written), the frame it names is placed as
// written where the project holds nothing of it, each LNode stays bound to its logical node; the IED records the ISD it
// came from, beside what it already listed. A name another IED holds is numbered, never taken over: that IED and what
// names it are left as they are. What apply writes is what the report lists.
describe('tx.lifecycle.apply - an ISD instance placed as a fork, keeping its identity', () => {
	const testCases: SclTest.TestCases = {
		'the instance ISD of BCU1 placed in South → BCU1 and North / E1 / Q01 written with their uuids and lineage, each LNode bound to BCU1, the ISD recorded on BCU1':
			{
				// South holds substation South and R1, nothing of BCU1 or North
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectSouth,
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="BCU1"][@uuid="b0000000-0000-4000-8000-000000000030"][@templateUuid="a0000000-0000-4000-8000-000000000030"]/default:IEDSourceFiles[count(default:SclFileReference)=3][default:SclFileReference[@fileType="SSD"][@fileUuid="f0000000-0000-4000-8000-000000000020"]]/default:SclFileReference[@fileType="ISD"][@fileUuid="f0000000-0000-4000-8000-000000000002"]',
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="CSWI"][@uuid="b0000000-0000-4000-8000-000000000021"][@templateUuid="a0000000-0000-4000-8000-000000000021"]',
					'/default:SCL[count(default:Substation)=2]/default:Substation[@name="North"][@uuid="b0000000-0000-4000-8000-000000000001"][not(@templateUuid)]/default:VoltageLevel[@name="E1"][@uuid="b0000000-0000-4000-8000-000000000002"]/default:Bay[@name="Q01"][@uuid="b0000000-0000-4000-8000-000000000003"][count(default:Function)=2]/default:Function[@name="BayControl"][@uuid="b0000000-0000-4000-8000-000000000004"][@templateUuid="a0000000-0000-4000-8000-000000000004"]/default:LNode[@lnClass="CSWI"][@iedName="BCU1"][@uuid="b0000000-0000-4000-8000-000000000011"][@lnUuid="b0000000-0000-4000-8000-000000000021"]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="BCU1"][@sLdInst="CTRL"]',
					'//default:Bay[@uuid="b0000000-0000-4000-8000-000000000003"]/default:Function[@name="LineProtection"][@uuid="b0000000-0000-4000-8000-000000000005"]/default:LNode[@lnClass="PTRC"][@iedName="BCU1"][@lnUuid="b0000000-0000-4000-8000-000000000024"]',
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@uuid="c0000000-0000-4000-8000-000000000006"]/default:ConnectedAP[@iedName="BCU1"][@apName="AP1"][@apUuid="b0000000-0000-4000-8000-000000000031"]',
				],
				unexpectedQueries: ['/default:SCL/default:Header/default:SourceFiles'],
			},
		'the instance ISD of BCU1 placed where the project holds its subnetwork StationBus by uuid → BCU1 placed, its connection on that subnetwork, none added':
			{
				// the instance's StationBus (uuid ...006) is the project's only element; BCU1 holds its connection on it
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectHoldingTheSubNetwork,
				expectedQueries: [
					'/default:SCL/default:IED[@name="BCU1"][@uuid="b0000000-0000-4000-8000-000000000030"]',
					'/default:SCL/default:Communication[count(default:SubNetwork)=1]/default:SubNetwork[@uuid="b0000000-0000-4000-8000-000000000006"][count(default:ConnectedAP)=1]/default:ConnectedAP[@iedName="BCU1"][@apUuid="b0000000-0000-4000-8000-000000000031"]',
				],
			},
		'the instance ISD of BCU1 placed where another IED is named BCU1 → BCU1_1 with its LNodes and specification naming it, the other BCU1 left as it is':
			{
				// the instance's BCU1 and North / E1 / Q01; the project's own BCU1 has another uuid
				sourceXml: isdInstanceOfBcu1,
				targetXml: projectWithAnotherBcu1,
				expectedQueries: [
					'/default:SCL[count(default:IED)=2]/default:IED[@name="BCU1"][@uuid="e0000000-0000-4000-8000-000000000030"][not(default:IEDSourceFiles)]',
					'//default:IED[@name="BCU1_1"][@uuid="b0000000-0000-4000-8000-000000000030"]',
					'//default:Bay[@uuid="b0000000-0000-4000-8000-000000000003"]/default:Function[@name="BayControl"][count(default:LNode[@iedName="BCU1_1"])=2]/default:LNode[@lnClass="CILO"][@lnUuid="b0000000-0000-4000-8000-000000000022"]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="BCU1_1"]',
					'//default:SubNetwork[@uuid="e0000000-0000-4000-8000-000000000006"][count(default:ConnectedAP)=2]/default:ConnectedAP[@iedName="BCU1"][@apUuid="e0000000-0000-4000-8000-000000000031"]',
					'//default:SubNetwork/default:ConnectedAP[@iedName="BCU1_1"][@apUuid="b0000000-0000-4000-8000-000000000031"]',
				],
				unexpectedQueries: ['//default:LNode[@iedName="BCU1"]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU1.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref: await onlyIed(sourceQuery),
			anchor: await projectRoot(target.query),
			scenario: 'fork',
		} as const
		const reported = target.query.lifecycle.report(lifecycle)
		// an instance is placed as a fork, the report lists it
		await expect(reported).resolves.toBeDefined()
		const report = await reported
		await target.transaction(async function applyInstance(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report })
		})
		// each element the report lists added is written: it names what it became
		const listed = report.instances.flatMap((instance) => [
			instance.tree,
			...instance.groups.flatMap((group) => group.companions),
		])
		const notWritten = listed.flatMap((node) => addedNodes(node)).filter((node) => !node.appliedRef)
		expect(notWritten.map((node) => node.tagName)).toEqual([])
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

async function onlyIed(sourceQuery: Core.Query<Config>): Promise<Scl.Ref<'IED'>> {
	const [ied] = await sourceQuery.getRecordsByTagName('IED')
	return { tagName: 'IED', id: ied.id }
}

async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const [root] = await query.getRecordsByTagName('SCL')
	return { tagName: 'SCL', id: root.id }
}

function addedNodes(node: DiffNode): DiffNode[] {
	const own = node.change === 'added' ? [node] : []
	return [...own, ...node.children.flatMap((child) => addedNodes(child))]
}
