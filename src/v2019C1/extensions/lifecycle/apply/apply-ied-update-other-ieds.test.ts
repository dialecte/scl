import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import isdTemplateThird from '../integration/ied/fixtures/isd-template-of-a-bay-controller-third-revision-sending-lphd.xml?raw'
import projectNorthWithSub1 from '../integration/ied/fixtures/project-north-with-bcu1-and-sub1-subscribing-to-it.xml?raw'
import projectNorthWithSub1TripAddressed from '../integration/ied/fixtures/project-north-with-bcu1-and-sub1-whose-trip-input-has-an-internal-address.xml?raw'
import projectNorthSub1OnPtrcThroughGoose from '../integration/ied/fixtures/project-north-with-sub1-subscribed-to-ptrc-through-position-goose.xml?raw'
import projectNorthSub1OnWholePosition from '../integration/ied/fixtures/project-north-with-sub1-subscribed-to-the-whole-position.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionGroup,
	OtherIedImpact,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type ImpactCase = SclTest.BaseXmlTestCase & {
	/** What the report lists accepting would change in SUB1, in order. */
	impacts: Pick<OtherIedImpact, 'ied' | 'effect'>[]
	/** The groups waiting for a decision: `<tag> <reason>`, sorted. */
	waiting: string[]
}

// What accepting a group of an IED update would change in another IED is listed before the decision, with the IED and
// what happens to each element; the group bringing it waits for a decision, suggested skip.
describe('query.lifecycle.report - what an S-IED update would change in another IED', () => {
	const testCases: SclTest.TestCases<ImpactCase> = {
		'the revision dropping PTRC, SUB1 naming PTRC1.Tr.general → the input of SUB1 listed as deleted (no internal address), the PTRC removal and that input waiting for a decision':
			{
				// the revision replaces PTRC by RREC; SUB1 names PTRC1.Tr.general by its uuid, no internal address
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				impacts: [{ ied: 'SUB1', effect: 'deleted' }],
				waiting: ['ExtRef names-deleted-data', 'LN changes-another-ied'],
			},
		'the third revision also sending LPHD1.Proxy instead of CSWI1.Pos in PositionGoose, SUB1 subscribing to CSWI1.Pos.stVal → that input listed as cleared, the entry removal waiting for a decision':
			{
				// the third revision's Positions sends LPHD1.Proxy.stVal; SUB1 subscribes to CSWI1.Pos.stVal through PositionGoose
				sourceXml: isdTemplateThird,
				targetXml: projectNorthWithSub1,
				impacts: [
					{ ied: 'SUB1', effect: 'deleted' },
					{ ied: 'SUB1', effect: 'cleared' },
				],
				waiting: [
					'ExtRef names-deleted-data',
					'FCDA changes-another-ied',
					'LN changes-another-ied',
				],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<ImpactCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await offered({
			call: function reportUpdate() {
				return target.query.lifecycle.report(lifecycle)
			},
		})
		expect((report.otherIedImpacts ?? []).map(({ ied, effect }) => ({ ied, effect }))).toEqual(
			testCase.impacts,
		)
		const groups = report.instances.flatMap((instance) => instance.groups)
		const waiting = groups.filter((group) => group.requiresDecision)
		expect(
			waiting.map((group) => `${group.primary.tagName} ${group.requiresDecision}`).sort(),
		).toEqual(testCase.waiting)
		expect(waiting.every((group) => group.suggestedAction === 'skip')).toBe(true)
		expect(report.needsDecisions).toBe(true)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Applied at its suggested actions, what waits for a decision is skipped: SUB1 is left as it is, the rest of the update
// is written.
describe('tx.lifecycle.apply - an S-IED update skipping what changes another IED', () => {
	const testCases: SclTest.TestCases = {
		'the revision dropping PTRC that SUB1 names, every group at its suggested action → PTRC kept, RREC added, SUB1 unchanged':
			{
				// the revision replaces PTRC by RREC; SUB1 names PTRC1.Tr.general by its uuid
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][default:LN[@lnClass="PTRC"][@uuid="b0000000-0000-4000-8000-000000000024"]]/default:LN[@lnClass="RREC"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@iedName="BCU1"][@lnClass="PTRC"][@doName="Tr"][@lnUuid="b0000000-0000-4000-8000-000000000024"]',
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
		const report = await offered({
			call: function reportUpdate() {
				return target.query.lifecycle.report(lifecycle)
			},
		})
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, group.suggestedAction] as const))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Accepted, a group changing another IED is written with the cleanup it brings there: an input without an internal
// address deleted, one with an address cleared of its source, an input subscribed to data its control block no longer
// sends cleared of that control block.
describe('tx.lifecycle.apply - an S-IED update changing another IED, accepted', () => {
	const testCases: SclTest.TestCases = {
		'the revision dropping PTRC, the groups waiting for a decision accepted, SUB1 naming PTRC1.Tr.general with no internal address → PTRC gone, that input deleted':
			{
				// SUB1's input c…006 names PTRC1.Tr.general by its uuid, no internal address
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				expectedQueries: ['//default:IED[@name="BCU1"]//default:LN[@lnClass="RREC"]'],
				unexpectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTRC"]',
					'//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"]',
				],
			},
		'the revision dropping PTRC, the groups waiting for a decision accepted, SUB1 naming PTRC1.Tr.general at its internal address TripIn → that input kept, its source cleared':
			{
				// SUB1's input c…006 names PTRC1.Tr.general by its uuid at its internal address TripIn
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1TripAddressed,
				expectedQueries: [
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@intAddr="TripIn"][not(@lnUuid)][not(@iedName)]',
				],
				unexpectedQueries: ['//default:IED[@name="BCU1"]//default:LN[@lnClass="PTRC"]'],
			},
		'the third revision no longer sending CSWI1.Pos in PositionGoose, the groups waiting for a decision accepted → SUB1’s input on CSWI1.Pos.stVal kept, its control block cleared':
			{
				// SUB1's input c…007 subscribes to CTRL/CSWI1.Pos.stVal through PositionGoose (b…033)
				sourceXml: isdTemplateThird,
				targetXml: projectNorthWithSub1,
				expectedQueries: [
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000007"][@lnClass="CSWI"][@doName="Pos"][@daName="stVal"][not(@srcCBName)][not(@srcCBUuid)][@serviceType="GOOSE"]',
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

type ListingCase = SclTest.BaseXmlTestCase & {
	/** What the report lists accepting would change in SUB1: `<effect>`, sorted. */
	effects: string[]
}

// An input subscribed to data several entries send loses its control block only when all of them go: the report lists
// it under each group removing one, cleared once all are accepted.
describe('query.lifecycle.report - an S-IED update, an input of another IED sent its data by several entries', () => {
	const testCases: SclTest.TestCases<ListingCase> = {
		'SUB1 subscribing to the whole CSWI1.Pos, Positions sending Pos.stVal and the project’s Pos.q, the third revision dropping Pos.stVal → that input listed cleared under both removals':
			{
				// the third revision replaces Pos.stVal by LPHD1.Proxy.stVal; Pos.q is the project's own entry
				sourceXml: isdTemplateThird,
				targetXml: projectNorthSub1OnWholePosition,
				effects: ['cleared', 'cleared', 'deleted'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<ListingCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		expect((report.otherIedImpacts ?? []).map((impact) => impact.effect).sort()).toEqual(
			testCase.effects,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, an input the cleanup deletes is not touched again, and one still sent its data by an entry the decisions
// keep (the project's own entries are kept here) keeps its control block.
describe('tx.lifecycle.apply - an S-IED update changing another IED, its inputs subscribed through a control block', () => {
	const testCases: SclTest.TestCases = {
		'SUB1’s trip input (no internal address) subscribed through PositionGoose, which also sends PTRC1.Tr.general, the revision dropping PTRC, the groups waiting accepted → the entry and that input gone':
			{
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthSub1OnPtrcThroughGoose,
				unexpectedQueries: [
					'//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"]',
					'//default:IED[@name="BCU1"]//default:FCDA[@lnClass="PTRC"]',
				],
			},
		'SUB1 subscribing to the whole CSWI1.Pos, the third revision dropping Pos.stVal, the groups waiting accepted, the project’s Pos.q kept → that input keeps PositionGoose':
			{
				sourceXml: isdTemplateThird,
				targetXml: projectNorthSub1OnWholePosition,
				expectedQueries: [
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000007"][@srcCBName="PositionGoose"][@srcCBUuid="b0000000-0000-4000-8000-000000000033"]',
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
		// the groups waiting for a decision accepted but the removal of an entry of the project's own changing SUB1, kept
		const decisions = new Map(
			groups.map(
				(group) =>
					[group.id, group.requiresDecision && !keptOwnEntry(group) ? 'accept' : 'skip'] as const,
			),
		)
		await offered({
			call: function applyUpdate() {
				return target.transaction(async function applyDecided(tx) {
					await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
				})
			},
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Whether a group removes an entry of the project's own that changes another IED: kept by the case. */
function keptOwnEntry(group: DecisionGroup): boolean {
	return group.change === 'target-only' && group.requiresDecision === 'changes-another-ied'
}

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
