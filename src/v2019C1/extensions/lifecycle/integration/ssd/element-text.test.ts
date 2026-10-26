import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The bay type the newer template gives. */
	newerType: string
	/** The groups of the update are declined. */
	declined?: boolean
	/** The groups of the update's report, `<change> <tag>`, sorted. */
	expectedGroups: string[]
	/** The text change of the bay type the report lists. */
	expectedTextChange?: { before: string; after: string }
}

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`

/** A bay template naming its bay type. */
const feederSsd = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="source-header"/>
		<Substation name="TEMPLATE" ${id}="source-substation">
			<VoltageLevel name="TEMPLATE" ${id}="source-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="source-feeder">
					<Private type="eIEC61850-6-100" ${id}="source-feeder-private">
						<eIEC61850-6-100:BayType ${id}="source-bay-type">Line feeder</eIEC61850-6-100:BayType>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-uuid" ${id}="source-breaker"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('ssd update: the text of an element is compared and reconciled like an attribute', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the bay type the template changed: listed, and written': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			newerType: 'Cable feeder',
			expectedGroups: ['modified BayType'],
			expectedTextChange: { before: 'Line feeder', after: 'Cable feeder' },
			expectedQueries: ['//default:Bay[@name="Feeder"]//v2019C1:BayType[text()="Cable feeder"]'],
		},
		'… declined: the bay keeps its type': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			newerType: 'Cable feeder',
			declined: true,
			expectedGroups: ['modified BayType'],
			expectedTextChange: { before: 'Line feeder', after: 'Cable feeder' },
			expectedQueries: ['//default:Bay[@name="Feeder"]//v2019C1:BayType[text()="Line feeder"]'],
		},
		'the same type, laid out otherwise: nothing listed': {
			sourceXml: feederSsd,
			targetXml: projectXml,
			newerType: '  Line feeder ',
			expectedGroups: [],
			expectedQueries: ['//default:Bay[@name="Feeder"]//v2019C1:BayType[text()="Line feeder"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const placement = feederTarget({ sourceQuery: source.query, scenario: 'instantiate' })
		await reportAndApply({ document: target, lifecycle: placement })
		await source.transaction(async function changeTheBayType(tx) {
			await tx.update({ tagName: 'BayType', id: 'source-bay-type' }, { value: testCase.newerType })
		})
		const { report } = await reportAndApply({
			document: target,
			lifecycle: feederTarget({ sourceQuery: source.query, scenario: 'template' }),
			decide: testCase.declined ? declineEvery : undefined,
		})
		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		const [group] = allGroups(report)
		expect(group?.primary.textChange).toEqual(testCase.expectedTextChange)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The bay of the template placed, or updated, in the project's voltage level. */
function feederTarget(params: {
	sourceQuery: Scl.Query
	scenario: LifecycleScenario
}): LifecycleTarget {
	const { sourceQuery, scenario } = params
	return {
		verb: 'ssd',
		sourceQuery,
		ref: { tagName: 'Bay', id: 'source-feeder' },
		anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
		scenario,
	}
}

/** Every group of a report declined. */
function declineEvery(reported: DiffReport): DecisionMap {
	return new Map(allGroups(reported).map((group) => [group.id, 'skip' as const]))
}
