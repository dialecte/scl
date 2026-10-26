import { listGroups, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type {
	LifecycleScenario,
	LifecycleTarget,
} from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A bay template: one bay, one function. */
const bayTemplate = /* xml */ `
	<SCL ${ns} ${id}="bay-template">
		<Header id="feeder" uuid="feeder-file-uuid" version="0" revision="1" ${id}="bay-header"/>
		<Substation name="TEMPLATE" ${id}="bay-substation">
			<VoltageLevel name="TEMPLATE" ${id}="bay-voltage-level">
				<Bay name="Feeder" uuid="feeder-uuid" ${id}="bay-feeder">
					<Function name="Prot" uuid="prot-uuid" ${id}="bay-prot"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** A voltage level template: its own two bays, one with a function. */
const levelTemplate = /* xml */ `
	<SCL ${ns} ${id}="level-template">
		<Header id="level" uuid="level-file-uuid" version="0" revision="1" ${id}="level-header"/>
		<Substation name="TEMPLATE" ${id}="level-substation">
			<VoltageLevel name="HV" uuid="level-uuid" ${id}="level-voltage-level">
				<Bay name="Coupler" uuid="coupler-uuid" ${id}="level-coupler">
					<Function name="Couple" uuid="couple-uuid" ${id}="level-couple"/>
				</Bay>
				<Bay name="Busbar" uuid="busbar-uuid" ${id}="level-busbar"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const emptySubstationXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`

describe("ssd update: a level the template does not hold is not the template's to remove", () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		/** A bay template is placed in the voltage level the level template placed. */
		withBayTemplate?: boolean
		/** The newer level template no longer holds its bay. */
		dropsItsBay?: boolean
		/** The removal of the levels listed is accepted. */
		acceptsRemovals?: boolean
		/** The groups of the level template's update, `<change> <tag>`, sorted. */
		expectedGroups: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"a bay template placed in the voltage level a template placed: the level template's update lists that bay as the project's own and keeps it":
			{
				sourceXml: levelTemplate,
				targetXml: emptySubstationXml,
				withBayTemplate: true,
				expectedGroups: ['target-only Bay'],
				expectedQueries: [
					'//default:VoltageLevel[@name="HV"]/default:Bay[@name="Feeder"]/default:Function[@name="Prot"]',
					'//default:VoltageLevel[@name="HV"]/default:Bay[@name="Coupler"]/default:Function[@name="Couple"]',
				],
			},
		"the newer level template drops its bay: listed as the project's own and kept": {
			sourceXml: levelTemplate,
			targetXml: emptySubstationXml,
			dropsItsBay: true,
			expectedGroups: ['target-only Bay'],
			expectedQueries: ['//default:Bay[@name="Coupler"]/default:Function[@name="Couple"]'],
		},
		'… its removal accepted: the bay goes with what it holds': {
			sourceXml: levelTemplate,
			targetXml: emptySubstationXml,
			dropsItsBay: true,
			acceptsRemovals: true,
			expectedGroups: ['target-only Bay'],
			expectedQueries: ['//default:VoltageLevel[@name="HV"]/default:Bay[@name="Busbar"]'],
			unexpectedQueries: ['//default:Bay[@name="Coupler"]', '//default:Function'],
		},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const bayFile = await openSclDocument({ project, xml: bayTemplate, label: 'bay template' })
		const placement = levelTarget({ sourceQuery: source.query, scenario: 'instantiate' })
		await reportAndApply({ document: target, lifecycle: placement })
		const [placedLevel] = await target.query.getRecordsByTagName('VoltageLevel')
		if (testCase.withBayTemplate) {
			await reportAndApply({
				document: target,
				lifecycle: {
					verb: 'ssd',
					sourceQuery: bayFile.query,
					ref: { tagName: 'Bay', id: 'bay-feeder' },
					anchor: { tagName: 'VoltageLevel', id: placedLevel.id },
					scenario: 'instantiate',
				},
			})
		}
		if (testCase.dropsItsBay) await source.transaction(dropTheCoupler)

		const { report } = await reportAndApply({
			document: target,
			lifecycle: levelTarget({ sourceQuery: source.query, scenario: 'template' }),
			decide: testCase.acceptsRemovals ? acceptEveryGroup : undefined,
		})
		expect(listGroups(report)).toEqual(testCase.expectedGroups)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The voltage level template placed, or updated, in the project's substation. */
function levelTarget(params: {
	sourceQuery: Scl.Query
	scenario: LifecycleScenario
}): LifecycleTarget {
	const { sourceQuery, scenario } = params
	return {
		verb: 'ssd',
		sourceQuery,
		ref: { tagName: 'VoltageLevel', id: 'level-voltage-level' },
		anchor: { tagName: 'Substation', id: 'project-substation' },
		scenario,
	}
}

/** The newer revision of the level template: its bay is gone. */
async function dropTheCoupler(tx: Scl.Transaction): Promise<void> {
	await tx.delete({ tagName: 'Bay', id: 'level-coupler' })
}

/** Every group of a report accepted. */
function acceptEveryGroup(report: DiffReport): DecisionMap {
	return new Map(allGroups(report).map((group) => [group.id, 'accept' as const]))
}

describe('ssd first placement: the unit root mapped onto a level of the project lands there', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		targetXml: string
		scenario: LifecycleScenario
		ref: Scl.Ref<'Bay' | 'VoltageLevel'>
		anchor: Scl.Ref<'Substation' | 'VoltageLevel'>
		chosen: DecisionMappings
	}

	const projectXml = /* xml */ `
		<SCL ${ns} ${id}="project">
			<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
			<Substation name="S1" ${id}="project-substation">
				<VoltageLevel name="V1" ${id}="project-voltage-level">
					<Bay name="B1" desc="Project bay" ${id}="project-bay"/>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const onTheProjectBay: DecisionMappings = new Map([
		['bay-feeder', { existing: { tagName: 'Bay', id: 'project-bay' } }],
	])
	const onTheProjectLevel: DecisionMappings = new Map([
		['level-voltage-level', { existing: { tagName: 'VoltageLevel', id: 'project-voltage-level' } }],
	])

	const testCases: SclTest.TestCases<TestCase> = {}
	for (const scenario of ['instantiate', 'template', 'fork'] as const) {
		testCases[
			`a bay template, ${scenario}: its function lands in the project bay, no bay is created`
		] = {
			sourceXml: bayTemplate,
			targetXml: projectXml,
			scenario,
			ref: { tagName: 'Bay', id: 'bay-feeder' },
			anchor: { tagName: 'VoltageLevel', id: 'project-voltage-level' },
			chosen: onTheProjectBay,
			expectedQueries: [
				'//default:Bay[@name="B1"][@desc="Project bay"]/default:Function[@name="Prot"]',
			],
			unexpectedQueries: ['//default:Bay[2]', '//default:Bay[@templateUuid]'],
		}
		testCases[
			`a voltage level template, ${scenario}: its bay lands in the project level, no level is created`
		] = {
			sourceXml: levelTemplate,
			targetXml: projectXml,
			scenario,
			ref: { tagName: 'VoltageLevel', id: 'level-voltage-level' },
			anchor: { tagName: 'Substation', id: 'project-substation' },
			chosen: onTheProjectLevel,
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="Coupler"]/default:Function[@name="Couple"]',
			],
			unexpectedQueries: ['//default:VoltageLevel[2]', '//default:VoltageLevel[@templateUuid]'],
		}
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = {
			verb: 'ssd',
			sourceQuery: source.query,
			ref: testCase.ref,
			anchor: testCase.anchor,
			scenario: testCase.scenario,
		} as LifecycleTarget
		await reportAndApply({
			document: target,
			lifecycle,
			mappings: testCase.chosen,
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
