import isdTemplateRevised from '../../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthWithSub1 from '../../integration/ied/fixtures/project-north-with-bcu1-and-sub1-subscribing-to-it.xml?raw'
import projectNorth from '../../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

// `tx.lifecycle.update.ied` without a report: everything the revision brings is written to the IED placed from the
// template, and to the specification its placement put beside it.
describe('tx.lifecycle.update.ied - an S-IED updated without a report', () => {
	const testCases: SclTest.TestCases = {
		'BCU1 placed from the first revision, the revision gaining RREC and dropping PTRC → RREC added, PTRC gone':
			{
				// the revision replaces PTRC by RREC
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][not(default:LN[@lnClass="PTRC"])]/default:LN[@lnClass="RREC"][@templateUuid="a0000000-0000-4000-8000-000000000026"]',
				],
			},
		'BCU1 with the specification its placement put on Q01, the revision replacing the LNode PTRC by an LNode RREC → the specification updated too, the RREC LNode bound to BCU1':
			{
				// LineProtection (b…005) holds the LNode b…014 the revision drops; the revision gains a…015, bound to RREC
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				expectedQueries: [
					'//default:Function[@uuid="b0000000-0000-4000-8000-000000000005"]/default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"][@iedName="BCU1"][@lnUuid=//default:IED[@name="BCU1"]//default:LN[@lnClass="RREC"]/@uuid]',
				],
				unexpectedQueries: ['//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"]'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const update = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		await offered({
			call: function updateBcu1() {
				return target.transaction(async function updateIed(tx) {
					await tx.lifecycle.update.ied(update)
				})
			},
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Without a report, the update writes everything the revision brings, a change in another IED with the cleanup it
// brings there included.
describe('tx.lifecycle.update.ied - an S-IED update changing another IED, without a report', () => {
	const testCases: SclTest.TestCases = {
		'SUB1 naming PTRC1.Tr.general of BCU1 with no internal address, the revision dropping PTRC → PTRC gone, that input deleted':
			{
				// the revision replaces PTRC by RREC; SUB1 names PTRC1.Tr.general by its uuid
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				expectedQueries: ['//default:IED[@name="BCU1"]//default:LN[@lnClass="RREC"]'],
				unexpectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTRC"]',
					'//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const update = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		await offered({
			call: function updateBcu1() {
				return target.transaction(async function updateIed(tx) {
					await tx.lifecycle.update.ied(update)
				})
			},
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Given a report and decisions, a group waiting for a decision left out of them is refused before anything is written.
describe('tx.lifecycle.update.ied - an S-IED update given decisions leaving a waiting group out', () => {
	const testCases: SclTest.TestCases = {
		'SUB1 naming PTRC1.Tr.general, the decisions leaving out the groups waiting for one → refused with DECISION_REQUIRED, the project as it was':
			{
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][not(default:LN[@lnClass="RREC"])]/default:LN[@lnClass="PTRC"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const update = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report({
			verb: 'ied',
			sourceQuery: update.sourceQuery,
			ref: update.iedRef,
			anchor: update.anchor,
		})
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(
			groups.flatMap((group) =>
				group.requiresDecision ? [] : [[group.id, group.suggestedAction] as const],
			),
		)
		await expect(
			target.transaction(async function updateIed(tx) {
				await tx.lifecycle.update.ied({ ...update, report, decisions })
			}),
		).rejects.toMatchObject({ cause: { key: 'DECISION_REQUIRED' } })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The update of BCU1 from a revision of its template ISD, read from the file. */
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
		sourceQuery,
		iedRef: await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' }),
		anchor: await projectRoot(target.query),
		fileType: 'ISD',
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
