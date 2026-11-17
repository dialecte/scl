import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthTwoInstances from '../integration/ied/fixtures/project-north-with-bcu1-and-bcu2-placed-from-the-first-revision.xml?raw'
import projectNorth from '../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// An update changes the S-IED it starts from only: another S-IED placed from the same template is left as it is.
describe('tx.lifecycle.apply - an S-IED update beside another instance of its template', () => {
	const testCases: SclTest.TestCases = {
		'BCU1 and BCU2 placed from the first revision, BCU1 updated → RREC added to BCU1 only, BCU2 and its connection unchanged':
			{
				// BCU2 (d…030) holds its access point AP1 (d…031) only, on the station bus beside BCU1's
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthTwoInstances,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="RREC"]',
					'/default:SCL/default:IED[@name="BCU2"][@uuid="d0000000-0000-4000-8000-000000000030"][count(*)=1]/default:AccessPoint[@uuid="d0000000-0000-4000-8000-000000000031"][not(*)]',
					'/default:SCL/default:Communication/default:SubNetwork[count(default:ConnectedAP)=2]/default:ConnectedAP[@iedName="BCU2"][@apName="AP1"][@apUuid="d0000000-0000-4000-8000-000000000031"][not(*)]',
				],
				unexpectedQueries: ['//default:IED[@name="BCU2"]/default:IEDSourceFiles'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions: new Map() } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A report kept and read back (a copy of it, not the object the report made) is decided as it was made: a group
// skipped is not written through the group of the element holding it.
describe('tx.lifecycle.apply - an S-IED update applied from a report read back', () => {
	const testCases: SclTest.TestCases = {
		'the report of the revision read back from JSON, the PTRC removal skipped, every other group accepted → PTRC kept, RREC added':
			{
				// the revision replaces PTRC (b…024 in BCU1) by RREC; the IED's own group changes its manufacturer
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][default:LN[@lnClass="RREC"]]/default:LN[@lnClass="PTRC"][@uuid="b0000000-0000-4000-8000-000000000024"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const made = await target.query.lifecycle.report(lifecycle)
		const report: typeof made = JSON.parse(JSON.stringify(made))
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(
			groups.map((group) => {
				const dropsPtrc = group.primary.tagName === 'LN' && group.change === 'removed'
				return [group.id, dropsPtrc ? 'skip' : 'accept'] as const
			}),
		)
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The update of BCU1 from a revision of its template ISD. */
async function updateOfBcu1(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	target: { query: Core.Query<Config> }
	sourceXml: string
}) {
	const { project, target, sourceXml } = params
	const imported = await project.importFile(
		new File([sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
	)
	const sourceQuery = project.openDocument(imported.documentId).query
	return {
		verb: 'ied',
		sourceQuery,
		ref: await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' }),
		anchor: await projectRoot(target.query),
		scenario: 'template',
		targetInstance: await iedNamed({ query: target.query, name: 'BCU1' }),
	} as const
}

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
