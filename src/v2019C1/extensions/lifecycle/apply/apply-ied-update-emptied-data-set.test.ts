import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthTrips from '../integration/ied/fixtures/project-north-with-bcu1-sending-ptrc-in-a-data-set-of-its-own.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type EmptiedCase = SclTest.BaseXmlTestCase & {
	/** What removing the entry does outside it: `<tag> <uuid> <effect>`, sorted. */
	sideEffects: string[]
}

// A data set the update leaves without an entry goes: the schema holds none empty. The report lists it, and the control
// block sending it, on the group removing its last entry.
describe('query.lifecycle.report - an S-IED update emptying a data set of the project', () => {
	const testCases: SclTest.TestCases<EmptiedCase> = {
		'the revision dropping PTRC, the data set Trips sending PTRC1.Tr.general only → Trips listed deleted, TripReport cleared, on the entry removal':
			{
				// Trips (e…001) holds one entry, naming BCU1's PTRC (b…024); TripReport (e…002) sends it
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthTrips,
				sideEffects: [
					'DataSet e0000000-0000-4000-8000-000000000001 deleted',
					'ReportControl e0000000-0000-4000-8000-000000000002 cleared',
				],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<EmptiedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const entryRemoval = report.instances
			.flatMap((instance) => instance.groups)
			.find((group) => group.primary.tagName === 'FCDA')
		const sideEffects = entryRemoval?.sideEffects ?? []
		const uuids = await uuidsOf({
			query: target.query,
			elements: sideEffects.map((entry) => entry.element),
		})
		const listed = sideEffects.map(
			(entry, position) => `${entry.element.tagName} ${uuids[position]} ${entry.effect}`,
		)
		expect(listed.sort()).toEqual(testCase.sideEffects)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Applied with the removals waiting for a decision accepted, the data set goes with its last entry, and the control block sending it loses it and
// gets its revision raised.
describe('tx.lifecycle.apply - an S-IED update emptying a data set of the project', () => {
	const testCases: SclTest.TestCases = {
		'the revision dropping PTRC, the removal of its entry accepted → PTRC, its entry and Trips gone, TripReport without a data set, at revision 2':
			{
				// Trips (e…001) holds one entry, naming BCU1's PTRC (b…024); TripReport (e…002) sends it at revision 1
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthTrips,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"]/default:LN0/default:ReportControl[@name="TripReport"][not(@datSet)][@confRev="10001"]',
				],
				unexpectedQueries: [
					'//default:DataSet[@name="Trips"]',
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTRC"]',
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
		const report = await target.query.lifecycle.report(lifecycle)
		const groups = report.instances.flatMap((instance) => instance.groups)
		// the removals waiting for a decision accepted, every other group at its suggested action
		const decisions = new Map(
			groups.map(
				(group) => [group.id, group.requiresDecision ? 'accept' : group.suggestedAction] as const,
			),
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

/** The uuid of each element, in order: empty for one the document no longer holds. */
async function uuidsOf(params: {
	query: Core.Query<Config>
	elements: readonly { tagName: string; id: string }[]
}): Promise<string[]> {
	const records = await params.query.any.getRecords([...params.elements])
	return records.map((record) =>
		record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : '',
	)
}
