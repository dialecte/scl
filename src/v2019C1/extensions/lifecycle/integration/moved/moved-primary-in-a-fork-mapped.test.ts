import { reportAndApply } from '../integration-helpers'
import feedersRevision1 from './fixtures/feeders-revision-1.xml?raw'
import movingCtrlIntoFeeder3 from './fixtures/feeders-revision-2-moving-ctrl-into-feeder3.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { standingChoiceKey } from '@/v2019C1/extensions/lifecycle/engine/standing/resolve-standings'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'
import type { AnyRefOrRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const CTRL_UUID = 'c0000000-0000-4000-8000-000000000011'

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

type MappedCase = ForkMoveCase & {
	/** The project bay the consumer maps the gained Feeder3 onto, by name (Bay_Z: an empty bay of the project's own). */
	mapsFeeder3Onto: string
}

// A level the template gained lands where the consumer maps it, before anything the engine would infer: mapped onto a
// bay of the project, the function moving into the gained level moves there.
describe('tx.lifecycle.apply - a fork moving a function into a gained bay the consumer maps', () => {
	const testCases: SclTest.TestCases<MappedCase> = {
		// revision 2 moves Ctrl into Feeder3 (c…005), which the consumer maps onto Bay_Z, an empty bay of the project's own;
		// left to the engine, Feeder3 would be read from the bay Ctrl sits in: the consumer's mapping wins
		"Feeder3 mapped onto the project's empty Bay_Z, Ctrl moved into Feeder3, accepted → Ctrl under Bay_Z, nothing created":
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: movingCtrlIntoFeeder3,
				mapsFeeder3Onto: 'Bay_Z',
				expectedQueries: [
					`//default:Bay[@uuid="project-bay-z-uuid"]/default:Function[@uuid="${CTRL_UUID}"]`,
					'//default:Bay[@uuid="c0000000-0000-4000-8000-000000000003"]',
				],
				unexpectedQueries: [
					'//default:Bay[@uuid="c0000000-0000-4000-8000-000000000005"]',
					`(//default:Function[@uuid="${CTRL_UUID}"])[2]`,
				],
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<MappedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const firstFork = await forkTarget({ sourceQuery: source.query })
		await reportAndApply({ document: target, lifecycle: firstFork })
		await addEmptyBayZ({ target })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		const mappings = await feeder3Onto({ target, next, bayName: testCase.mapsFeeder3Onto })
		await reportAndApply({
			document: target,
			lifecycle: secondFork,
			mappings,
			decide: (report) => acceptEvery(report.instances.flatMap((instance) => instance.groups)),
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Mapping the gained Feeder3 onto the project's Feeder, the bay the revision's own Feeder stands on, would put two levels
// of the template on one level of the project: refused as any choice of a level that is no candidate.
describe('tx.lifecycle.apply - a fork mapping a gained bay onto the bay another level stands on', () => {
	const testCases: SclTest.TestCases<MappedCase & { expectedRefusal: string }> = {
		"Feeder3 mapped onto Feeder, where the revision's Feeder stands → refused MAPPING_CHOICE_NOT_A_CANDIDATE":
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: movingCtrlIntoFeeder3,
				mapsFeeder3Onto: 'Feeder',
				expectedRefusal: 'MAPPING_CHOICE_NOT_A_CANDIDATE',
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<MappedCase & { expectedRefusal: string }>): Promise<void> {
		if (!target) throw new Error('target required')
		const firstFork = await forkTarget({ sourceQuery: source.query })
		await reportAndApply({ document: target, lifecycle: firstFork })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		const mappings = await feeder3Onto({ target, next, bayName: testCase.mapsFeeder3Onto })
		const refused = await reportAndApply({
			document: target,
			lifecycle: secondFork,
			mappings,
			decide: (report) => acceptEvery(report.instances.flatMap((instance) => instance.groups)),
		}).then(
			() => 'committed',
			(error: unknown) => toDialecteError(error)?.key,
		)
		expect(refused).toBe(testCase.expectedRefusal)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// A bay of the project's own (a uuid no level of the unit carries) holding the function a gained level holds is still
// the level that gained level was mapped onto: the skip applies only to a level of the unit.
describe('tx.lifecycle.apply - a fork moving a function into a gained bay, the function in a bay of the project', () => {
	const testCases: SclTest.TestCases<ForkMoveCase> = {
		// the project adds Bay_Y (its own uuid) and moves Ctrl into it; revision 2 moves Ctrl into the new Feeder3
		"Ctrl in the project's Bay_Y, revision 2 putting Ctrl in a new Feeder3 → Feeder3 stands on Bay_Y, nothing created":
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: movingCtrlIntoFeeder3,
				// a fork's names follow the revision: Bay_Y keeps its record and uuid and takes the name Feeder3
				expectedQueries: [
					`//default:Bay[@uuid="project-bay-y-uuid"]/default:Function[@uuid="${CTRL_UUID}"]`,
				],
				unexpectedQueries: ['//default:Bay[@uuid="c0000000-0000-4000-8000-000000000005"]'],
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
		const [voltageLevel] = await target.query.getRecordsByTagName('VoltageLevel')
		const [ctrl] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: CTRL_UUID },
		})
		if (!voltageLevel || !ctrl) throw new Error('the first fork placed nothing')
		await target.transaction(async function moveCtrlToABayOfTheProject(tx) {
			const bayY = await tx.addChild(voltageLevel, {
				tagName: 'Bay',
				attributes: { name: 'Bay_Y', uuid: 'project-bay-y-uuid' },
			})
			await tx.any.move(ctrl, { parent: bayY })
		})
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		await reportAndApply({
			document: target,
			lifecycle: secondFork,
			decide: (report) => acceptEvery(report.instances.flatMap((instance) => instance.groups)),
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The consumer's choice: the gained Feeder3 of revision 2 stands on a bay of the project, by its name. */
async function feeder3Onto(params: {
	target: { query: Scl.Query }
	next: { query: Scl.Query }
	bayName: string
}): Promise<DecisionMappings> {
	const { target, next, bayName } = params
	const [voltageLevel] = await target.query.getRecordsByTagName('VoltageLevel')
	const [bay] = await target.query.findByAttributes({
		tagName: 'Bay',
		attributes: { name: bayName },
	})
	const [feeder3] = await next.query.findByAttributes({
		tagName: 'Bay',
		attributes: { name: 'Feeder3' },
	})
	if (!voltageLevel || !bay || !feeder3) throw new Error('missing a level to map')
	const key = standingChoiceKey({ instance: { id: voltageLevel.id }, child: { id: feeder3.id } })
	return new Map([[key, { existing: { tagName: 'Bay', id: bay.id } }]])
}

/** Every group accepted. */
function acceptEvery(groups: readonly DecisionGroup[]): DecisionMap {
	return new Map(groups.map((group) => [group.id, 'accept'] as const))
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

/** An empty bay of the project's own, Bay_Z, in the voltage level the first fork placed. */
async function addEmptyBayZ(params: {
	target: { query: Scl.Query; transaction: Scl.Document['transaction'] }
}): Promise<void> {
	const [voltageLevel] = await params.target.query.getRecordsByTagName('VoltageLevel')
	if (!voltageLevel) throw new Error('the first fork placed nothing')
	await params.target.transaction(async function addBayZ(tx) {
		await tx.addChild(voltageLevel, {
			tagName: 'Bay',
			attributes: { name: 'Bay_Z', uuid: 'project-bay-z-uuid' },
		})
	})
}
