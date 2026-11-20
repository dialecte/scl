import { listGroups, reportAndApply } from '../integration-helpers'
import feedersRevision1 from './fixtures/feeders-revision-1.xml?raw'
import movingCtrlIntoFeeder3 from './fixtures/feeders-revision-2-moving-ctrl-into-feeder3.xml?raw'
import movingCtrlToFeeder2 from './fixtures/feeders-revision-2-moving-ctrl-to-feeder2.xml?raw'
import removingFeeder from './fixtures/feeders-revision-2-removing-feeder-moving-ctrl-to-feeder2.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type { AnyRefOrRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const CTRL_UUID = 'c0000000-0000-4000-8000-000000000011'
const CSWI_LNODE_UUID = 'c0000000-0000-4000-8000-000000000012'

const projectSubstation = {
	tagName: 'Substation',
	id: 'project-substation',
} as Scl.Ref<'Substation'>

/** The project: one substation the feeder file's voltage level is forked into. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`

type Decide = (groups: readonly DecisionGroup[]) => DecisionMap

type ForkMoveCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The newer revision the second fork takes. */
	nextXml: string
	/** The groups of the second fork's report, `<change> <tag>`, sorted. */
	expectedGroups?: string[]
	/** Each moved group as `<tag> from <level> to <level>, waiting for <change> <tag>` (the levels by name). */
	expectedMoves?: string[]
	decide?: Decide
	/** The second apply refuses with this code. */
	expectedRefusal?: string
}

// In a fork, a function the newer revision of the file puts on another level is one change, `moved`: the function's own
// group, decided on its own, its content changes in their own groups.
describe('query.lifecycle.report - a fork of a newer revision moving a function to another bay', () => {
	const testCases: SclTest.TestCases<ForkMoveCase> = {
		// revision 1 forked first; revision 2 moves Ctrl (c…011) from Feeder to Feeder2 and adds CILO1 to it
		'revision 2 moving Ctrl from Feeder to Feeder2 → one moved Function, CILO1 added in its own group':
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: movingCtrlToFeeder2,
				expectedGroups: ['added LNode', 'moved Function'],
				expectedMoves: ['Function from Feeder to Feeder2'],
			},
		// revision 2 moves Ctrl into Feeder3 (c…005), which it adds
		'revision 2 moving Ctrl into a bay it adds → the bay added, the move depending on it': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: movingCtrlIntoFeeder3,
			expectedGroups: ['added Bay', 'moved Function'],
			expectedMoves: ['Function from Feeder to Feeder3, waiting for added Bay'],
		},
		// revision 2 removes Feeder and moves Ctrl out of it to Feeder2
		'revision 2 removing Feeder while Ctrl moves out of it → the removal depending on the move': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: removingFeeder,
			expectedGroups: ['moved Function', 'removed Bay'],
			expectedMoves: ['Function from Feeder to Feeder2'],
		},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<ForkMoveCase>) {
		if (!target) throw new Error('target required')
		const firstFork = await forkTarget({ sourceQuery: source.query })
		await reportAndApply({ document: target, lifecycle: firstFork })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		// the report alone: nothing is applied, so what it names is still there to read
		const report = await target.query.lifecycle.report(secondFork)
		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		const groups = report.instances.flatMap((instance) => instance.groups)
		const moves = await Promise.all(
			groups
				.filter((group) => group.change === 'moved')
				.map((group) =>
					describeMove({ group, groups, query: target.query, sourceQuery: next.query }),
				),
		)
		expect(moves).toEqual(testCase.expectedMoves)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, the move writes the function under its new bay, the same record; what names it by path follows. Skipped,
// it stays where it is, its other accepted changes written there.
describe('tx.lifecycle.apply - a fork of a newer revision moving a function to another bay', () => {
	const testCases: SclTest.TestCases<ForkMoveCase> = {
		// every group accepted
		'Ctrl moved from Feeder to Feeder2, accepted → Ctrl under Feeder2, the same record, held once':
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: movingCtrlToFeeder2,
				decide: acceptEvery,
				expectedQueries: [
					`//default:Bay[@name="Feeder2"]/default:Function[@uuid="${CTRL_UUID}"]/default:LNode[@lnClass="CILO"]`,
				],
				unexpectedQueries: [
					'//default:Bay[@name="Feeder"]/default:Function',
					`(//default:Function[@uuid="${CTRL_UUID}"])[2]`,
				],
			},
		// the move skipped, CILO1's addition accepted
		'Ctrl moved, the move skipped → Ctrl under Feeder, CILO1 added there': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: movingCtrlToFeeder2,
			decide: skipMoves,
			expectedQueries: [
				`//default:Bay[@name="Feeder"]/default:Function[@uuid="${CTRL_UUID}"]/default:LNode[@lnClass="CILO"]`,
			],
			unexpectedQueries: ['//default:Bay[@name="Feeder2"]/default:Function[@name="Ctrl"]'],
		},
		// Prot's SourceRef names CSWI1 (c…012) by path: it follows the move, its uuid unchanged
		'Ctrl moved, accepted → the SourceRef naming CSWI1 names it under Feeder2': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: movingCtrlToFeeder2,
			decide: acceptEvery,
			expectedQueries: [
				`//v2019C1:SourceRef[@sourceLNodeUuid="${CSWI_LNODE_UUID}"][contains(@source, "/E1/Feeder2/Ctrl/CSWI1")]`,
			],
			unexpectedQueries: [`//v2019C1:SourceRef[contains(@source, "/E1/Feeder/Ctrl/")]`],
		},
		'Ctrl moved into the bay Feeder3 the revision adds, accepted → Feeder3 holding Ctrl, Feeder still there':
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: movingCtrlIntoFeeder3,
				decide: acceptEvery,
				expectedQueries: [
					`//default:Bay[@name="Feeder3"]/default:Function[@uuid="${CTRL_UUID}"]`,
					'//default:VoltageLevel/default:Bay[@name="Feeder"][@uuid="c0000000-0000-4000-8000-000000000003"]',
				],
				unexpectedQueries: [`(//default:Function[@uuid="${CTRL_UUID}"])[2]`],
			},
		'Feeder removed and Ctrl moved out of it, both accepted → Feeder gone, Ctrl under Feeder2': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: removingFeeder,
			decide: acceptEvery,
			expectedQueries: [`//default:Bay[@name="Feeder2"]/default:Function[@uuid="${CTRL_UUID}"]`],
			unexpectedQueries: ['//default:Bay[@name="Feeder"]'],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<ForkMoveCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const firstFork = await forkTarget({ sourceQuery: source.query })
		await reportAndApply({ document: target, lifecycle: firstFork })
		const [before] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: CTRL_UUID },
		})
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		const decide = testCase.decide ?? acceptEvery
		await reportAndApply({
			document: target,
			lifecycle: secondFork,
			decide: (report) => decide(report.instances.flatMap((instance) => instance.groups)),
		})
		const [after] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: CTRL_UUID },
		})
		expect(after?.id).toBe(before?.id)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A move skipped while what depends on it is accepted is refused, as any skipped dependency.
describe('tx.lifecycle.apply - a fork accepting what a skipped move of a function holds up', () => {
	const testCases: SclTest.TestCases<ForkMoveCase> = {
		'Ctrl moved into Feeder3, the move accepted, the bay skipped → refused DECISION_DEPENDENCY_SKIPPED':
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: movingCtrlIntoFeeder3,
				decide: acceptButSkipAddedBays,
				expectedRefusal: 'DECISION_DEPENDENCY_SKIPPED',
			},
		'Feeder removed accepted, Ctrl moved out of it skipped → refused DECISION_DEPENDENCY_SKIPPED': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: removingFeeder,
			decide: skipMovesAcceptTheRest,
			expectedRefusal: 'DECISION_DEPENDENCY_SKIPPED',
		},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<ForkMoveCase>) {
		if (!target) throw new Error('target required')
		const firstFork = await forkTarget({ sourceQuery: source.query })
		await reportAndApply({ document: target, lifecycle: firstFork })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		const decide = testCase.decide ?? acceptEvery
		const applied = reportAndApply({
			document: target,
			lifecycle: secondFork,
			decide: (report) => decide(report.instances.flatMap((instance) => instance.groups)),
		})
		const refused = await applied.then(
			() => 'committed',
			(error: unknown) => toDialecteError(error)?.key,
		)
		expect(refused).toBe(testCase.expectedRefusal)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Every group accepted. */
function acceptEvery(groups: readonly DecisionGroup[]): DecisionMap {
	return new Map(groups.map((group) => [group.id, 'accept'] as const))
}

/** Every group at its suggested action, but the moves skipped. */
function skipMoves(groups: readonly DecisionGroup[]): DecisionMap {
	return new Map(
		groups.map(
			(group) => [group.id, group.change === 'moved' ? 'skip' : group.suggestedAction] as const,
		),
	)
}

/** Every group accepted, but the moves skipped. */
function skipMovesAcceptTheRest(groups: readonly DecisionGroup[]): DecisionMap {
	return new Map(
		groups.map((group) => [group.id, group.change === 'moved' ? 'skip' : 'accept'] as const),
	)
}

/** Every group accepted, but the bays added skipped. */
function acceptButSkipAddedBays(groups: readonly DecisionGroup[]): DecisionMap {
	return new Map(
		groups.map(
			(group) =>
				[
					group.id,
					group.change === 'added' && group.primary.tagName === 'Bay' ? 'skip' : 'accept',
				] as const,
		),
	)
}

/** A moved group as `<tag> from <level> to <level>`, and what it waits for: the levels by name. */
async function describeMove(params: {
	group: DecisionGroup
	groups: readonly DecisionGroup[]
	query: Scl.Query
	sourceQuery: Scl.Query
}): Promise<string> {
	const { group, groups, query, sourceQuery } = params
	const { primary } = group
	const from = primary.movedFrom ? await nameOf({ query, ref: primary.movedFrom }) : '?'
	// a level the revision adds is named from the source
	const to = primary.movedTo
		? ((await nameOf({ query, ref: primary.movedTo })) ??
			(await nameOf({ query: sourceQuery, ref: primary.movedTo })))
		: '?'
	const waited = groups
		.filter((other) => group.dependsOn.includes(other.id))
		.map((other) => `${other.change} ${other.primary.tagName}`)
	const waiting = waited.length > 0 ? `, waiting for ${waited.join(', ')}` : ''
	return `${primary.tagName} from ${from} to ${to}${waiting}`
}

/** The name of an element of a document, when the document holds it. */
async function nameOf(params: {
	query: Scl.Query
	ref: AnyRefOrRecord
}): Promise<string | undefined> {
	const [record] = await params.query.any.getRecords([params.ref])
	return record?.attributes.find((attribute) => attribute.name === 'name')?.value
}

/** The fork of the file's voltage level into the project's substation, given its previous revision when there is one. */
async function forkTarget(params: {
	sourceQuery: Scl.Query
	baseQuery?: Scl.Query
}): Promise<LifecycleTarget> {
	const { sourceQuery, baseQuery } = params
	const [voltageLevel] = await sourceQuery.getRecordsByTagName('VoltageLevel')
	return {
		verb: 'ssd',
		sourceQuery,
		ref: { tagName: 'VoltageLevel', id: voltageLevel.id },
		anchor: projectSubstation,
		scenario: 'fork',
		...(baseQuery ? { baseQuery } : {}),
	}
}
