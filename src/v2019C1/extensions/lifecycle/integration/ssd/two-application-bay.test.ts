import { findByName, reportAndApply } from '../integration-helpers'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'
import { readRevisionTwin } from '@/v2019C1/test/revision-twins'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleScenario } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { DiffNode, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// Bays of two applications each, their functions classified by categories the bays share: each bay placed brings the
// references to what it places into the shared categories, none twice; the newer revision has the breaker application
// compose the protection function too, which its role then allocates, once.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level"/>
		</Substation>
	</SCL>
`
const projectVoltageLevel = {
	tagName: 'VoltageLevel',
	id: 'project-voltage-level',
} as Scl.Ref<'VoltageLevel'>

/** One step of a case: a bay of the template placed, or the instance of a bay updated from the newer revision. */
type Step = {
	bay: 'BAY1' | 'BAY2'
	scenario: Extract<LifecycleScenario, 'instantiate' | 'template'>
	/** The revision of the template the step reads. Default: the first to place, the newer to update. */
	revision?: 1 | 2
}

/** A node a report lists, with the tag of the node holding it. */
type ListedNode = { node: DiffNode; parentTag?: string }

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	steps: Step[]
	/** What each step's report lists added: `<category references> <function references>`, by source element. */
	listed: string[]
}

const APPLICATION_MANAGEMENT = '//v2019C1:FunctionCategory[@name="APPLICATION MANAGEMENT"]'
const GENERIC_FUNCTION = '//v2019C1:FunctionCategory[@name="GENERIC FUNCTION"]'
const BAY1 = '//default:Bay[@name="BAY1"]'

describe('ssd: bays of two applications sharing their categories', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		"one bay placed alone → each shared category names that bay's functions alone, each role allocates once":
			{
				sourceXml: readRevisionTwin({ twin: 'twoApplicationBay', revision: 1 }),
				targetXml: projectXml,
				steps: [{ bay: 'BAY1', scenario: 'instantiate' }],
				listed: ['4 4'],
				expectedQueries: [
					`${APPLICATION_MANAGEMENT}[count(v2019C1:FunctionCatRef)=2]`,
					`${APPLICATION_MANAGEMENT}/v2019C1:FunctionCatRef[@function="S1/V1/BAY1/P21_Fn/Application Management"]`,
					`${GENERIC_FUNCTION}[count(v2019C1:FunctionCatRef)=2]`,
					`${BAY1}//v2019C1:AllocationRole[@name="PROT"][count(v2019C1:FunctionRef)=1]`,
					`${BAY1}//v2019C1:AllocationRole[@name="BCU"][count(v2019C1:FunctionRef)=1]`,
				],
				unexpectedQueries: ['//v2019C1:FunctionCatRef[contains(@function, "BAY2")]'],
			},
		'the other bay placed next → the categories gain its references, nothing twice': {
			sourceXml: readRevisionTwin({ twin: 'twoApplicationBay', revision: 1 }),
			targetXml: projectXml,
			steps: [
				{ bay: 'BAY1', scenario: 'instantiate' },
				{ bay: 'BAY2', scenario: 'instantiate' },
			],
			listed: ['4 4', '4 4'],
			expectedQueries: [
				`//default:Substation[@name="S1"][count(.${APPLICATION_MANAGEMENT})=1][count(.${GENERIC_FUNCTION})=1]`,
				`${APPLICATION_MANAGEMENT}[count(v2019C1:FunctionCatRef)=4]`,
				`${GENERIC_FUNCTION}[count(v2019C1:FunctionCatRef)=4]`,
				`${GENERIC_FUNCTION}/v2019C1:FunctionCatRef[@function="S1/V1/BAY2/CBR1_Fn"]`,
			],
		},
		'the bay updated to the newer revision → the breaker application and its role gain the protection function, once':
			{
				sourceXml: readRevisionTwin({ twin: 'twoApplicationBay', revision: 1 }),
				targetXml: projectXml,
				steps: [
					{ bay: 'BAY1', scenario: 'instantiate' },
					{ bay: 'BAY1', scenario: 'template' },
				],
				listed: ['4 4', '0 2'],
				expectedQueries: [
					`${BAY1}//v2019C1:Application[@name="CBR1_App"][count(.//v2019C1:FunctionRef)=2]`,
					`${BAY1}//v2019C1:Application[@name="CBR1_App"]//v2019C1:FunctionRef[@function="S1/V1/BAY1/P21_Fn"]`,
					`${BAY1}//v2019C1:AllocationRole[@name="BCU"][count(v2019C1:FunctionRef)=2]`,
					`${BAY1}//v2019C1:AllocationRole[@name="BCU"]/v2019C1:FunctionRef[@function="S1/V1/BAY1/P21_Fn"]`,
					`${BAY1}[count(default:Function[@name="P21_Fn"])=1]`,
					`${GENERIC_FUNCTION}[count(v2019C1:FunctionCatRef)=2]`,
				],
			},
		'the newer revision placed afresh, where two applications compose one function → the report lists each reference once, as written':
			{
				sourceXml: readRevisionTwin({ twin: 'twoApplicationBay', revision: 1 }),
				targetXml: projectXml,
				steps: [{ bay: 'BAY1', scenario: 'instantiate', revision: 2 }],
				listed: ['4 6'],
				expectedQueries: [
					`${APPLICATION_MANAGEMENT}[count(v2019C1:FunctionCatRef)=2]`,
					`${GENERIC_FUNCTION}[count(v2019C1:FunctionCatRef)=2]`,
					`${BAY1}[count(default:Function[@name="P21_Fn"])=1]`,
					`${BAY1}//v2019C1:AllocationRole[@name="BCU"][count(v2019C1:FunctionRef)=2]`,
				],
			},
	}

	async function act({
		testCase,
		project,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const listed: string[] = []
		for (const step of testCase.steps) {
			const template =
				(step.revision ?? (step.scenario === 'template' ? 2 : 1)) === 2
					? await openSclDocument({
							project,
							xml: readRevisionTwin({ twin: 'twoApplicationBay', revision: 2 }),
							label: 'next revision',
						})
					: source
			const ref = await findByName(template.query, { tagName: 'Bay', name: step.bay })
			const { report } = await reportAndApply({
				document: target,
				lifecycle: {
					verb: 'ssd',
					scenario: step.scenario,
					sourceQuery: template.query,
					ref,
					anchor: projectVoltageLevel,
				},
			})
			listed.push(describeListed(report))
		}
		expect(listed, 'report').toEqual(testCase.listed)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** What a report lists added, by source element: `<category references> <function references>` (applications' and roles'). */
function describeListed(report: DiffReport): string {
	const added = allGroups(report)
		.flatMap((group) => [group.primary, ...group.companions])
		.flatMap((node) => flattenNodes({ node }))
		.filter((listed) => listed.node.change === 'added')
	const countOf = (params: { tagName: string }): number =>
		new Set(
			added
				.filter((listed) => listed.node.tagName === params.tagName)
				.map((listed) => listed.node.sourceRef?.id),
		).size
	const categoryReferences = countOf({ tagName: 'FunctionCatRef' })
	const functionReferences = countOf({ tagName: 'FunctionRef' })
	return `${categoryReferences} ${functionReferences}`
}

/** A report node and every node below it, each with the tag of the node holding it. */
function flattenNodes(params: { node: DiffNode; parentTag?: string }): ListedNode[] {
	const { node, parentTag } = params
	return [
		{ node, parentTag },
		...node.children.flatMap((child) => flattenNodes({ node: child, parentTag: node.tagName })),
	]
}
