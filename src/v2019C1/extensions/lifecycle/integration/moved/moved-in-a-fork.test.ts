import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const projectSubstation = {
	tagName: 'Substation',
	id: 'project-substation',
} as Scl.Ref<'Substation'>

/** The project: one substation the file's voltage level is forked into. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`

/** The feeder file, revision 1: the breaker QA1 in Feeder, Feeder2 holding a control function. */
const feedersRevision1 = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeders" uuid="feeders-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="E1" uuid="e1-uuid" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-uuid" ${id}="source-breaker"/>
				</Bay>
				<Bay name="Feeder2" uuid="feeder2-uuid" ${id}="source-feeder2">
					<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** The feeder file, revision 2: the breaker QA1 moved to Feeder2. */
const feedersRevision2 = /* xml */ `
	<SCL ${ns} ${id}="source-r2">
		<Header id="feeders" uuid="feeders-file-uuid" version="0" revision="2" ${id}="source-r2-header"/>
		<Substation name="TEMPLATE" ${id}="source-r2-substation">
			<VoltageLevel name="E1" uuid="e1-uuid" ${id}="source-r2-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-r2-feeder"/>
				<Bay name="Feeder2" uuid="feeder2-uuid" ${id}="source-r2-feeder2">
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-uuid" ${id}="source-r2-breaker"/>
					<Function name="Ctrl" uuid="ctrl-uuid" ${id}="source-r2-ctrl"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type ForkMoveCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The newer revision the second fork takes. */
	nextXml: string
	/** The groups of the second fork's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
}

// In a fork, an element the newer revision of the file puts under another parent is one change, `moved`: never added
// beside itself, never left where it was.
describe('query.lifecycle.report - a fork of a newer revision moving a breaker to another bay', () => {
	const testCases: SclTest.TestCases<ForkMoveCase> = {
		// revision 1 forked first; revision 2 moves QA1 (breaker-uuid) from Feeder to Feeder2
		'revision 2 moving QA1 from Feeder to Feeder2 → one moved ConductingEquipment': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: feedersRevision2,
			expectedGroups: ['moved ConductingEquipment'],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<ForkMoveCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const firstFork = await forkTarget({ sourceQuery: source.query })
		await reportAndApply({ document: target, lifecycle: firstFork })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		const { report } = await reportAndApply({
			document: target,
			lifecycle: secondFork,
			decide: () => new Map(),
		})
		expect(listGroups(report)).toEqual(testCase.expectedGroups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, the move writes the breaker under its new bay, the same record: never a copy beside it.
describe('tx.lifecycle.apply - a fork of a newer revision moving a breaker to another bay', () => {
	const testCases: SclTest.TestCases<ForkMoveCase> = {
		// revision 1 forked first; revision 2 moves QA1 (breaker-uuid) from Feeder to Feeder2, every group accepted
		'revision 2 moving QA1 from Feeder to Feeder2, accepted → QA1 under Feeder2, the same record, held once':
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: feedersRevision2,
				expectedGroups: ['moved ConductingEquipment'],
				expectedQueries: [
					'//default:Bay[@uuid="feeder2-uuid"]/default:ConductingEquipment[@name="QA1"][@uuid="breaker-uuid"]',
				],
				unexpectedQueries: [
					'//default:Bay[@uuid="feeder-uuid"]/default:ConductingEquipment',
					'(//default:ConductingEquipment[@uuid="breaker-uuid"])[2]',
				],
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
			tagName: 'ConductingEquipment',
			attributes: { uuid: 'breaker-uuid' },
		})
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const secondFork = await forkTarget({ sourceQuery: next.query, baseQuery: source.query })
		await reportAndApply({
			document: target,
			lifecycle: secondFork,
			decide: (report) =>
				new Map(
					report.instances
						.flatMap((instance) => instance.groups)
						.map((group) => [group.id, 'accept'] as const),
				),
		})
		const [after] = await target.query.findByAttributes({
			tagName: 'ConductingEquipment',
			attributes: { uuid: 'breaker-uuid' },
		})
		expect(after?.id).toBe(before?.id)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

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
