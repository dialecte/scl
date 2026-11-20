import { listGroups, reportAndApply } from '../integration-helpers'
import levelRevision1WithAlarm from './fixtures/level-template-revision-1-with-alarm-in-q02.xml?raw'
import levelRevision1 from './fixtures/level-template-revision-1.xml?raw'
import movingBayControl from './fixtures/level-template-revision-2-moving-baycontrol-to-q02.xml?raw'
import movingDisplayBesideAlarm from './fixtures/level-template-revision-2-moving-display-beside-alarm.xml?raw'
import movingDisplay from './fixtures/level-template-revision-2-moving-display-to-q02.xml?raw'

import { toRef } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type {
	DecisionGroup,
	DecisionMap,
	DiffNode,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const BAY_CONTROL_UUID = 'd0000000-0000-4000-8000-000000000011'
const DISPLAY_UUID = 'd0000000-0000-4000-8000-000000000021'
const Q02_UUID = 'd0000000-0000-4000-8000-000000000004'

const projectSubstation = {
	tagName: 'Substation',
	id: 'project-substation',
} as Scl.Ref<'Substation'>

/** The project: one substation the voltage level template is placed in. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`

/** The project with a voltage level of its own holding the bay `Bay_X`, the template's Q02 mapped onto it. */
const projectWithBayXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="Bay_X" desc="Project bay" ${id}="project-bay-x"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type TemplateMoveCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The revised template the update takes. */
	nextXml: string
	/** How many times the template is placed before the update. */
	placements: number
	/** The first placement maps the template's voltage level onto V1 and its Q02 onto Bay_X. */
	mapsQ02OntoBayX?: boolean
	/** A hand copy of BayControl, its lineage kept, sits in the first instance's Q02 before the update. */
	handCopyInQ02?: boolean
	/** The groups of the update's report, `<change> <tag>`, sorted. */
	expectedGroups?: string[]
	/** How many moved groups, each listed for its own instance (`placedFor`, distinct). */
	expectedMovesPerInstance?: number
	/** Each move as `<tag> from <level> to <level>`, the levels by name, sorted. */
	expectedMoves?: string[]
	decide?: (groups: readonly DecisionGroup[]) => DecisionMap
	/** The primary the revision moves, by its tag and its template's uuid: its records kept through the update. */
	moved?: { tagName: 'Application' | 'Function'; templateUuid: string }
}

// In a template update, a primary the revised template puts on another level of its unit is one move per instance of
// the unit, each decided on its own; a level a level of the unit was mapped onto counts as that level.
describe('query.lifecycle.report - a template update moving a primary to another bay', () => {
	const testCases: SclTest.TestCases<TemplateMoveCase> = {
		// placed twice: E1 and its second instance; the revision moves BayControl (d…011) from Q01 to Q02
		'BayControl moved from Q01 to Q02, the template placed twice → one moved Function per instance':
			{
				sourceXml: levelRevision1,
				targetXml: projectXml,
				nextXml: movingBayControl,
				placements: 2,
				expectedGroups: ['moved Function', 'moved Function'],
				expectedMovesPerInstance: 2,
				expectedMoves: ['Function from Q01 to Q02', 'Function from Q01 to Q02'],
			},
		// the application Display (d…021) sits in Q01's Private
		'Display moved from Q01 to Q02 → one moved Application': {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: movingDisplay,
			placements: 1,
			expectedGroups: ['moved Application'],
			expectedMovesPerInstance: 1,
			expectedMoves: ['Application from Q01 to Q02'],
		},
		// two holds of BayControl in one instance: nothing tells which one the revision moved
		'a hand copy of BayControl in Q02, BayControl moved to Q02 → no moved group': {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: movingBayControl,
			placements: 1,
			handCopyInQ02: true,
			expectedGroups: [],
			expectedMovesPerInstance: 0,
			expectedMoves: [],
		},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<TemplateMoveCase>) {
		if (!target) throw new Error('target required')
		await placeTemplate({ testCase, source, target })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const update = await updateTarget({ sourceQuery: next.query })
		const { report } = await reportAndApply({
			document: target,
			lifecycle: update,
			decide: () => new Map(),
		})
		expect(listGroups(report).filter((group) => group.startsWith('moved'))).toEqual(
			testCase.expectedGroups,
		)
		const movedInstances = report.instances.filter((instance) =>
			instance.groups.some((group) => group.change === 'moved'),
		)
		const movedFor = movedInstances.map((instance) => instance.placedFor?.id)
		expect(movedFor.every((placedFor) => placedFor !== undefined)).toBe(true)
		expect(new Set(movedFor).size).toBe(testCase.expectedMovesPerInstance)
		const moves = await Promise.all(
			movedInstances.map((instance) => moveOf({ query: target.query, tree: instance.tree })),
		)
		expect(moves.sort()).toEqual(testCase.expectedMoves)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, each instance's primary moves under that instance's new bay, the same record; an application lands in the
// bay's Private of its namespace, the one there or a new one.
describe('tx.lifecycle.apply - a template update moving a primary to another bay', () => {
	const testCases: SclTest.TestCases<TemplateMoveCase> = {
		'BayControl moved, placed twice, every group accepted → BayControl under Q02 in both instances':
			{
				sourceXml: levelRevision1,
				targetXml: projectXml,
				nextXml: movingBayControl,
				placements: 2,
				decide: acceptEvery,
				expectedQueries: [
					`(//default:VoltageLevel)[1]/default:Bay[@name="Q02"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
					`(//default:VoltageLevel)[2]/default:Bay[@name="Q02"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
				],
				unexpectedQueries: [`//default:Bay[@name="Q01"]/default:Function`],
			},
		'BayControl moved, placed twice, only the first instance accepted → moved there only': {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: movingBayControl,
			placements: 2,
			decide: acceptTheFirstMoveOnly,
			expectedQueries: [
				`(//default:VoltageLevel)[1]/default:Bay[@name="Q02"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
				`(//default:VoltageLevel)[2]/default:Bay[@name="Q01"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
			],
		},
		// the first placement mapped Q02 (d…004) onto the project's Bay_X
		'a hand copy of BayControl in Q02, BayControl moved to Q02, accepted → both where they were': {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: movingBayControl,
			placements: 1,
			handCopyInQ02: true,
			decide: acceptEvery,
			expectedQueries: [
				`//default:Bay[@name="Q01"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
				`//default:Bay[@name="Q02"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
			],
		},
		'Q02 mapped onto Bay_X, BayControl moved to Q02, accepted → BayControl under Bay_X': {
			sourceXml: levelRevision1,
			targetXml: projectWithBayXml,
			nextXml: movingBayControl,
			placements: 1,
			mapsQ02OntoBayX: true,
			decide: acceptEvery,
			expectedQueries: [
				`//default:Bay[@name="Bay_X"][@desc="Project bay"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
			],
			unexpectedQueries: [`//default:Bay[@name="Q01"]/default:Function`],
		},
		// Q02 holds no Private: the commit wraps the moved application in a new one of its namespace
		'Display moved to Q02, accepted → Display in a Private of its namespace under Q02, held once': {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: movingDisplay,
			placements: 1,
			decide: acceptEvery,
			moved: { tagName: 'Application', templateUuid: DISPLAY_UUID },
			expectedQueries: [
				`//default:Bay[@name="Q02"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:Application[@templateUuid="${DISPLAY_UUID}"]/v2019C1:FunctionRole[@name="Operator"]`,
			],
			unexpectedQueries: [
				`//default:Bay[@name="Q01"]//v2019C1:Application`,
				`(//v2019C1:Application[@templateUuid="${DISPLAY_UUID}"])[2]`,
				`//default:Bay[@name="Q02"]/default:Private[@type="eIEC61850-6-100"][2]`,
			],
		},
		// Q02's Private holds the application Alarm (d…031): the moved application joins it, no second Private
		"Display moved into Q02 beside Alarm, accepted → both in Q02's one Private, held once": {
			sourceXml: levelRevision1WithAlarm,
			targetXml: projectXml,
			nextXml: movingDisplayBesideAlarm,
			placements: 1,
			decide: acceptEvery,
			moved: { tagName: 'Application', templateUuid: DISPLAY_UUID },
			expectedQueries: [
				`//default:Bay[@name="Q02"]/default:Private[@type="eIEC61850-6-100"][v2019C1:Application[@name="Alarm"]]/v2019C1:Application[@templateUuid="${DISPLAY_UUID}"]`,
			],
			unexpectedQueries: [
				`//default:Bay[@name="Q01"]//v2019C1:Application`,
				`//default:Bay[@name="Q02"]/default:Private[@type="eIEC61850-6-100"][2]`,
			],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TemplateMoveCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await placeTemplate({ testCase, source, target })
		const moved = testCase.moved ?? { tagName: 'Function', templateUuid: BAY_CONTROL_UUID }
		const lineage = { tagName: moved.tagName, attributes: { templateUuid: moved.templateUuid } }
		const before = await target.query.findByAttributes(lineage)
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const update = await updateTarget({ sourceQuery: next.query })
		const decide = testCase.decide ?? acceptEvery
		await reportAndApply({
			document: target,
			lifecycle: update,
			decide: (report) => decide(report.instances.flatMap((instance) => instance.groups)),
		})
		const after = await target.query.findByAttributes(lineage)
		// moved, never copied: the same records
		expect(after.map((record) => record.id).sort()).toEqual(
			before.map((record) => record.id).sort(),
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A primary the consumer moved onto a level of the project outside the unit is the project's placement: the revision
// moving it inside the unit compares nothing there, it stays where the consumer put it.
describe('query.lifecycle.report - a template update moving a primary the project placed outside the unit', () => {
	const testCases: SclTest.TestCases<TemplateMoveCase> = {
		// placed once, then the consumer moves BayControl onto the project's own Bay_X (V1, outside the unit)
		"BayControl on the project's Bay_X, the revision moving it from Q01 to Q02 → no moved group": {
			sourceXml: levelRevision1,
			targetXml: projectWithBayXml,
			nextXml: movingBayControl,
			placements: 1,
			expectedGroups: [],
		},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<TemplateMoveCase>) {
		if (!target) throw new Error('target required')
		await placeTemplate({ testCase, source, target })
		const [bayControl] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: BAY_CONTROL_UUID },
		})
		if (!bayControl) throw new Error('no BayControl placed')
		await target.transaction(async function moveOntoTheProjectBay(tx) {
			await tx.any.move(bayControl, { parent: { tagName: 'Bay', id: 'project-bay-x' } })
		})
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const update = await updateTarget({ sourceQuery: next.query })
		const { report } = await reportAndApply({
			document: target,
			lifecycle: update,
			decide: () => new Map(),
		})
		expect(listGroups(report).filter((group) => group.startsWith('moved'))).toEqual(
			testCase.expectedGroups,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** Every group accepted. */
function acceptEvery(groups: readonly DecisionGroup[]): DecisionMap {
	return new Map(groups.map((group) => [group.id, 'accept'] as const))
}

/** Every group accepted but the moves after the first one. */
function acceptTheFirstMoveOnly(groups: readonly DecisionGroup[]): DecisionMap {
	const [firstMove] = groups.filter((group) => group.change === 'moved')
	return new Map(
		groups.map(
			(group) =>
				[group.id, group.change === 'moved' && group !== firstMove ? 'skip' : 'accept'] as const,
		),
	)
}

/** The template placed as the case says: as many times, mapped, with a hand copy. */
async function placeTemplate(params: {
	testCase: TemplateMoveCase
	source: SclTest.ActParams<TemplateMoveCase>['source']
	target: NonNullable<SclTest.ActParams<TemplateMoveCase>['target']>
}): Promise<void> {
	const { testCase, source, target } = params
	const placement = await placementTarget({ sourceQuery: source.query })
	const mappings = testCase.mapsQ02OntoBayX ? await q02OntoBayX(source.query) : undefined
	for (let turn = 0; turn < testCase.placements; turn++) {
		await reportAndApply({
			document: target,
			lifecycle: placement,
			...(mappings ? { mappings } : {}),
		})
	}
	if (!testCase.handCopyInQ02) return
	const [q02] = await target.query.findByAttributes({
		tagName: 'Bay',
		attributes: { templateUuid: Q02_UUID },
	})
	if (!q02) throw new Error('no Q02 placed')
	await target.transaction(async function copyBayControlByHand(tx) {
		await tx.addChild(q02 as Scl.Ref<'Bay'>, {
			tagName: 'Function',
			attributes: { name: 'BayControl', templateUuid: BAY_CONTROL_UUID },
		})
	})
}

/** The template's voltage level onto the project's V1, its Q02 onto Bay_X: by the source's record ids. */
async function q02OntoBayX(sourceQuery: Scl.Query): Promise<DecisionMappings> {
	const [voltageLevel] = await sourceQuery.getRecordsByTagName('VoltageLevel')
	const [q02] = await sourceQuery.findByAttributes({
		tagName: 'Bay',
		attributes: { uuid: Q02_UUID },
	})
	if (!q02) throw new Error('no Q02 in the template')
	return new Map([
		[voltageLevel.id, { existing: { tagName: 'VoltageLevel', id: 'project-voltage-level' } }],
		[q02.id, { existing: { tagName: 'Bay', id: 'project-bay-x' } }],
	])
}

/** The first placement of the template's voltage level in the project's substation. */
async function placementTarget(params: { sourceQuery: Scl.Query }): Promise<LifecycleTarget> {
	const [voltageLevel] = await params.sourceQuery.getRecordsByTagName('VoltageLevel')
	return {
		verb: 'ssd',
		sourceQuery: params.sourceQuery,
		ref: { tagName: 'VoltageLevel', id: voltageLevel.id },
		anchor: projectSubstation,
		scenario: 'instantiate',
	}
}

/** The update of every instance of the template's voltage level from its revision. */
async function updateTarget(params: { sourceQuery: Scl.Query }): Promise<LifecycleTarget> {
	const [voltageLevel] = await params.sourceQuery.getRecordsByTagName('VoltageLevel')
	return {
		verb: 'ssd',
		sourceQuery: params.sourceQuery,
		ref: { tagName: 'VoltageLevel', id: voltageLevel.id },
		anchor: projectSubstation,
		scenario: 'template',
	}
}

/** A moved primary as `<tag> from <level> to <level>`, the levels by their names in the project. */
async function moveOf(params: { query: Scl.Query; tree: DiffNode }): Promise<string> {
	const { query, tree } = params
	const levels = [tree.movedFrom, tree.movedTo].flatMap((ref) => (ref ? [toRef(ref)] : []))
	const records = await query.any.getRecords(levels)
	const [from, to] = records.map((record) =>
		record ? readAttribute({ record, name: 'name', defaults: 'none' }) : '?',
	)
	return `${tree.tagName} from ${from} to ${to}`
}
