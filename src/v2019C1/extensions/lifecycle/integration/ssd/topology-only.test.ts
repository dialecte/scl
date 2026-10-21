import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The scenario the template is placed with, then updated with. */
	placedWith: LifecycleScenario
	updatedWith: LifecycleScenario
	/** The groups of the update's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
	/** The update's report lists the instance it found, not a first placement. */
	expectedMatched: boolean
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

/** A bay template with equipment only: no application, no function. */
const feederSsd = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-uuid" ${id}="source-breaker"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('ssd update of a template holding levels and equipment only', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a template update finds the bay it placed and writes the equipment change there': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			placedWith: 'instantiate',
			updatedWith: 'template',
			expectedGroups: ['modified ConductingEquipment'],
			expectedMatched: true,
			expectedQueries: ['//default:Bay/default:ConductingEquipment[@name="QA1"][@desc="rev2"]'],
			unexpectedQueries: ['//default:VoltageLevel[@name="V1"]/default:Bay[2]'],
		},
		'a fork finds the bay it placed and writes the equipment change there, each uuid once': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			placedWith: 'fork',
			updatedWith: 'fork',
			expectedGroups: ['modified ConductingEquipment'],
			expectedMatched: true,
			expectedQueries: [
				'//default:Bay[@uuid="feeder-uuid"]/default:ConductingEquipment[@uuid="breaker-uuid"][@desc="rev2"]',
			],
			unexpectedQueries: [
				'(//default:Bay[@uuid="feeder-uuid"])[2]',
				'(//default:ConductingEquipment[@uuid="breaker-uuid"])[2]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = (scenario: LifecycleScenario): LifecycleTarget =>
			({
				verb: 'ssd',
				sourceQuery: source.query,
				ref: { tagName: 'Bay', id: 'source-feeder' },
				anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
				scenario,
			}) as LifecycleTarget

		await reportAndApply({ document: target, lifecycle: lifecycle(testCase.placedWith) })
		await source.transaction(async function changeTheBreaker(tx) {
			await tx.update(
				{ tagName: 'ConductingEquipment', id: 'source-breaker' } as Scl.Ref<'ConductingEquipment'>,
				{
					attributes: { desc: 'rev2' },
				},
			)
		})
		const { report } = await reportAndApply({
			document: target,
			lifecycle: lifecycle(testCase.updatedWith),
		})

		expect(report.instances.some((instance) => instance.rootRef !== undefined)).toBe(
			testCase.expectedMatched,
		)
		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
