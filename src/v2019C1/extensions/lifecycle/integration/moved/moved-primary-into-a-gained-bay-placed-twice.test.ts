import { reportAndApply } from '../integration-helpers'
import levelRevision1 from './fixtures/level-template-revision-1.xml?raw'
import movingBayControlIntoQ03 from './fixtures/level-template-revision-2-moving-baycontrol-into-new-q03.xml?raw'

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
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const BAY_CONTROL_UUID = 'd0000000-0000-4000-8000-000000000011'
const Q03_UUID = 'd0000000-0000-4000-8000-000000000006'

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

/** How a case decides the report: given the voltage level of each instance, first placement first. */
type Decide = (params: { report: DiffReport; voltageLevelIds: readonly string[] }) => DecisionMap

type GainedTwiceCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The revised template the update takes. */
	nextXml: string
	decide: Decide
	/** The update refuses with this key. */
	expectedRefusal?: string
}

// The template placed twice, its revision adding Q03 (d…006) and moving BayControl (d…011) into it: each instance's
// move waits for its own instance's Q03, never the other's.
describe('tx.lifecycle.apply - a template update moving a primary into a gained bay, placed twice', () => {
	const testCases: SclTest.TestCases<GainedTwiceCase> = {
		'every group accepted → BayControl under a new Q03 in both instances, the same records': {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: movingBayControlIntoQ03,
			decide: ({ report }) => decideAll({ report, skipFor: () => false }),
			expectedQueries: [
				`(//default:VoltageLevel)[1]/default:Bay[@templateUuid="${Q03_UUID}"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
				`(//default:VoltageLevel)[2]/default:Bay[@templateUuid="${Q03_UUID}"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
			],
			unexpectedQueries: [`//default:Bay[@name="Q01"]/default:Function`],
		},
		'the first instance skipped, the second accepted → moved in the second only, the first untouched':
			{
				sourceXml: levelRevision1,
				targetXml: projectXml,
				nextXml: movingBayControlIntoQ03,
				decide: ({ report, voltageLevelIds }) =>
					decideAll({ report, skipFor: (instanceId) => instanceId === voltageLevelIds[0] }),
				expectedQueries: [
					`(//default:VoltageLevel)[1]/default:Bay[@name="Q01"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
					`(//default:VoltageLevel)[2]/default:Bay[@templateUuid="${Q03_UUID}"]/default:Function[@templateUuid="${BAY_CONTROL_UUID}"]`,
				],
				unexpectedQueries: [`(//default:VoltageLevel)[1]/default:Bay[@templateUuid="${Q03_UUID}"]`],
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<GainedTwiceCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const voltageLevelIds = await placeTwice({ source, target })
		const lineage = { tagName: 'Function', attributes: { templateUuid: BAY_CONTROL_UUID } } as const
		const before = await target.query.findByAttributes(lineage)
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const update = await updateTarget({ sourceQuery: next.query })
		await reportAndApply({
			document: target,
			lifecycle: update,
			decide: (report) => testCase.decide({ report, voltageLevelIds }),
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

// A move into a gained bay accepted with that instance's own addition of the bay skipped is refused: the bay it lands
// in would not be there.
describe('tx.lifecycle.apply - a template update moving a primary into a gained bay whose addition is skipped', () => {
	const testCases: SclTest.TestCases<GainedTwiceCase> = {
		"the second instance's Q03 skipped, its move accepted → refused DECISION_DEPENDENCY_SKIPPED": {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: movingBayControlIntoQ03,
			decide: ({ report, voltageLevelIds }) => {
				const decisions = decideAll({ report, skipFor: () => false })
				for (const instance of report.instances) {
					if (instanceIdOf(instance) !== voltageLevelIds[1]) continue
					for (const group of instance.groups)
						if (group.change === 'added' && group.primary.tagName === 'Bay')
							decisions.set(group.id, 'skip')
				}
				return decisions
			},
			expectedRefusal: 'DECISION_DEPENDENCY_SKIPPED',
		},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<GainedTwiceCase>) {
		if (!target) throw new Error('target required')
		const voltageLevelIds = await placeTwice({ source, target })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const update = await updateTarget({ sourceQuery: next.query })
		const refused = await reportAndApply({
			document: target,
			lifecycle: update,
			decide: (report) => testCase.decide({ report, voltageLevelIds }),
		}).then(
			() => 'committed',
			(error: unknown) => toDialecteError(error)?.key,
		)
		expect(refused).toBe(testCase.expectedRefusal)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The instance a report instance belongs to: the voltage level it was placed for, or its own root. */
function instanceIdOf(instance: DiffReport['instances'][number]): string | undefined {
	return instance.placedFor?.id ?? instance.rootRef?.id
}

/** Every group accepted, but those of the instances `skipFor` names. */
function decideAll(params: {
	report: DiffReport
	skipFor: (instanceId: string | undefined) => boolean
}): Map<string, 'accept' | 'skip'> {
	return new Map(
		params.report.instances.flatMap((instance) => {
			const action = params.skipFor(instanceIdOf(instance)) ? 'skip' : 'accept'
			return instance.groups.map((group) => [group.id, action] as const)
		}),
	)
}

/** The template's voltage level placed twice in the project's substation: the ids of the two instances, in order. */
async function placeTwice(params: {
	source: SclTest.ActParams<GainedTwiceCase>['source']
	target: NonNullable<SclTest.ActParams<GainedTwiceCase>['target']>
}): Promise<string[]> {
	const { source, target } = params
	const [voltageLevel] = await source.query.getRecordsByTagName('VoltageLevel')
	const placement: LifecycleTarget = {
		verb: 'ssd',
		sourceQuery: source.query,
		ref: { tagName: 'VoltageLevel', id: voltageLevel.id },
		anchor: projectSubstation,
		scenario: 'instantiate',
	}
	await reportAndApply({ document: target, lifecycle: placement })
	await reportAndApply({ document: target, lifecycle: placement })
	const placed = await target.query.getRecordsByTagName('VoltageLevel')
	return placed.map((record) => record.id)
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
