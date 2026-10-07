import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const typicalBayRef = { tagName: 'Bay', id: 'feeder-s' } as Scl.Ref<'Bay'>
const substationRef = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>

// A bay typical "Feeder": a breaker, a function of its own (Prot), and an application (HMI)
// composing a function of the bay (Disp).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="Feeder" uuid="feeder-source-uuid" ${id}="feeder-s">
					<Private type="eIEC61850-6-100" ${id}="feeder-private-s">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="hmi-source-uuid" ${id}="hmi-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="hmi-role-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="hmi-role-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Feeder/Disp" functionUuid="display-source-uuid" ${id}="hmi-function-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" uuid="breaker-source-uuid" ${id}="breaker-s"/>
					<Function name="Prot" uuid="protection-source-uuid" ${id}="protection-s"/>
					<Function name="Disp" uuid="display-source-uuid" ${id}="display-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// Two voltage levels: where the typical's voltage level lands is the consumer's to choose (V1).
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-1-t"/>
			<VoltageLevel name="V2" ${id}="voltage-level-2-t"/>
		</Substation>
	</SCL>
`

const BAY = '//default:VoltageLevel[@name="V1"]/default:Bay[@name="Feeder"]'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The source elements whose groups the consumer leaves out, by record id. */
	leftOut?: string[]
	/** Each listed group (source record id) depends on the groups of these source elements. */
	expectedDependsOn?: Record<string, string[]>
	/** The decisions are refused before anything is written (a dependency is left out). */
	refused?: boolean
}

describe('first placement of a bay typical — every leave-out is honoured, a level takes what it holds with it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing left out → the bay, its breaker, its functions and the application': {
			sourceXml,
			targetXml: projectXml,
			expectedDependsOn: {
				'protection-s': ['feeder-s'],
				'display-s': ['feeder-s'],
				'hmi-s': ['feeder-s', 'display-s'],
			},
			expectedQueries: [
				`${BAY}/default:ConductingEquipment[@name="QA1"]`,
				`${BAY}/default:Function[@name="Prot"]`,
				`${BAY}/default:Function[@name="Disp"]`,
				`${BAY}//v2019C1:Application[@name="HMI"]`,
			],
		},
		'the bay left out with what it holds → nothing is written': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['feeder-s', 'protection-s', 'display-s', 'hmi-s'],
			unexpectedQueries: [
				'//default:Bay',
				'//default:Function',
				'//v2019C1:Application',
				'//default:VoltageLevel[@name="TEMPLATE"]',
			],
		},
		'the bay left out, one of its functions kept → refused, nothing is written': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['feeder-s', 'display-s', 'hmi-s'],
			refused: true,
			unexpectedQueries: ['//default:Bay', '//default:Function'],
		},
		'a function left out → the bay is placed without it': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['protection-s'],
			expectedQueries: [
				`${BAY}/default:ConductingEquipment[@name="QA1"]`,
				`${BAY}/default:Function[@name="Disp"]`,
				`${BAY}//v2019C1:Application[@name="HMI"]`,
			],
			unexpectedQueries: ['//default:Function[@name="Prot"]'],
		},
		'a composed function left out with the application referring to it → the bay keeps the rest': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['display-s', 'hmi-s'],
			expectedQueries: [
				`${BAY}/default:ConductingEquipment[@name="QA1"]`,
				`${BAY}/default:Function[@name="Prot"]`,
			],
			unexpectedQueries: ['//default:Function[@name="Disp"]', '//v2019C1:Application'],
		},
		'the application left out alone → the function it composes is placed without it': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['hmi-s'],
			expectedQueries: [
				`${BAY}/default:Function[@name="Prot"]`,
				`${BAY}/default:Function[@name="Disp"]`,
			],
			unexpectedQueries: ['//v2019C1:Application'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const mappings = new Map<string, DecisionMapping>([
			['voltage-level-s', { existing: { tagName: 'VoltageLevel', id: 'voltage-level-1-t' } }],
		])
		const lifecycleTarget = {
			verb: 'ssd' as const,
			sourceQuery: source.query,
			ref: typicalBayRef,
			anchor: substationRef,
		}

		const placementReport = await report(target.query, {
			...lifecycleTarget,
			resolution: { mappings },
		})

		for (const [sourceId, dependencyIds] of Object.entries(testCase.expectedDependsOn ?? {})) {
			const group = groupOf({ report: placementReport, sourceId })
			const dependencies = dependencyIds.map(
				(dependencyId) => groupOf({ report: placementReport, sourceId: dependencyId }).id,
			)
			expect(group.dependsOn.slice().sort(), sourceId).toEqual(dependencies.sort())
		}

		const leftOut = new Set(testCase.leftOut ?? [])
		const decisions: DecisionMap = new Map()
		for (const group of allGroups(placementReport)) {
			const sourceId = group.primary.sourceRef?.id ?? ''
			decisions.set(group.id, leftOut.has(sourceId) ? 'skip' : 'accept')
		}

		const applied = target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				report: placementReport,
				resolution: { decisions, mappings },
			})
		})
		if (testCase.refused) {
			await expect(applied).rejects.toThrow('is skipped')
			return { assertOn: 'target' }
		}
		await applied

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The group placing a source element. */
function groupOf(params: { report: DiffReport; sourceId: string }) {
	const group = allGroups(params.report).find(
		(candidate) => candidate.primary.sourceRef?.id === params.sourceId,
	)
	if (!group) throw new Error(`no group places ${params.sourceId}`)
	return group
}
