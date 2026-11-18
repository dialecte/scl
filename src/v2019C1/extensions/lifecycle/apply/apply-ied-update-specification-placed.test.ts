import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthWithBcu2 from '../integration/ied/fixtures/project-north-with-bcu1-and-bcu2-placed-from-the-first-revision.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// An S-IED the project holds no specification of (placed before its file carried one, or with it left out) is offered
// its specification by the update, placed as a first placement places it, bound to the IED updated: the
// specification of another IED placed from the same template is no part of it.
describe('tx.lifecycle.apply - an S-IED update placing its specification', () => {
	const testCases: SclTest.TestCases = {
		'BCU2 placed without its specification beside BCU1 with its own, BCU2 updated at the suggested actions → its specification placed in a new bay of E1, bound to BCU2, BCU1’s unchanged':
			{
				// BCU1's specification sits on Q01; BCU2 (d…030) holds its access point only
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithBcu2,
				expectedQueries: [
					'//default:VoltageLevel[@name="E1"]/default:Bay[@templateUuid="a0000000-0000-4000-8000-000000000003"]/default:Function[@templateUuid="a0000000-0000-4000-8000-000000000005"]/default:LNode[@lnClass="RREC"][@iedName="BCU2"][@lnUuid=//default:IED[@name="BCU2"]//default:LN[@lnClass="RREC"]/@uuid]',
					'//default:Bay[@name="Q01"]/default:Function[@name="LineProtection"][count(default:LNode)=2]/default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"][@iedName="BCU1"]',
					'//default:IED[@name="BCU2"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ISD"][@revision="2"]',
				],
				unexpectedQueries: [
					'//default:Bay[@name="Q01"]//default:LNode[@lnClass="RREC"]',
					'/default:SCL/default:Header/default:SourceFiles',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const ref = await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' })
		const anchor = await projectRoot(target.query)
		const targetInstance = await iedNamed({ query: target.query, name: 'BCU2' })
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref,
			anchor,
			scenario: 'template',
			targetInstance,
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, group.suggestedAction] as const))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Its groups skipped, the specification offered to an IED the project holds none of is not written.
describe('tx.lifecycle.apply - an S-IED update, the specification offered skipped', () => {
	const testCases: SclTest.TestCases = {
		'BCU2 placed without its specification, BCU2 updated with the specification groups skipped → no bay added, BCU2’s logical nodes updated':
			{
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithBcu2,
				expectedQueries: [
					'/default:SCL/default:Substation/default:VoltageLevel[count(default:Bay)=1]',
					'//default:IED[@name="BCU2"]//default:LN[@lnClass="RREC"]',
				],
				unexpectedQueries: ['//default:LNode[@iedName="BCU2"]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const imported = await project.importFile(
			new File([testCase.sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
		)
		const sourceQuery = project.openDocument(imported.documentId).query
		const ref = await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' })
		const anchor = await projectRoot(target.query)
		const targetInstance = await iedNamed({ query: target.query, name: 'BCU2' })
		const lifecycle = {
			verb: 'ied',
			sourceQuery,
			ref,
			anchor,
			scenario: 'template',
			targetInstance,
		} as const
		const report = await target.query.lifecycle.report(lifecycle)
		const [ied, ...specification] = report.instances
		// the IED's groups at their suggested action, the specification's skipped
		const decisions = new Map([
			...(ied?.groups ?? []).map((group) => [group.id, group.suggestedAction] as const),
			...specification
				.flatMap((instance) => instance.groups)
				.map((group) => [group.id, 'skip'] as const),
		])
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
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

/** The root of the project. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
