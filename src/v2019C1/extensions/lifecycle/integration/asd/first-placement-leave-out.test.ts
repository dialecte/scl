import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'hmi-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

// An application (HMI) composing two functions of its template bay (Prot, Disp).
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Header id="asd-header" uuid="asd-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-private-s">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="hmi-source-uuid" ${id}="hmi-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="hmi-role-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="hmi-role-content-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="protection-source-uuid" ${id}="hmi-protection-ref-s"/>
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Disp" functionUuid="display-source-uuid" ${id}="hmi-display-ref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="protection-source-uuid" ${id}="protection-s"/>
					<Function name="Disp" uuid="display-source-uuid" ${id}="display-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const BAY = '//default:Bay[@name="B1"]'

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The source elements whose groups the consumer leaves out, by record id. */
	leftOut?: string[]
	/** Each listed group (source record id) depends on the groups of these source elements. */
	expectedDependsOn?: Record<string, string[]>
	/** The decisions are refused before anything is written (a dependency is left out). */
	refused?: boolean
}

describe('first placement of an application — every leave-out is honoured, a reference goes with what it points at', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing left out → the application and the functions it composes': {
			sourceXml,
			targetXml: projectXml,
			expectedDependsOn: {
				'hmi-s': ['protection-s', 'display-s'],
				'protection-s': [],
				'display-s': [],
			},
			expectedQueries: [
				`${BAY}//v2019C1:Application[@name="HMI"]`,
				`${BAY}/default:Function[@name="Prot"]`,
				`${BAY}/default:Function[@name="Disp"]`,
			],
		},
		'a function left out with the application referring to it → the other function alone': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['protection-s', 'hmi-s'],
			expectedQueries: [`${BAY}/default:Function[@name="Disp"]`],
			unexpectedQueries: [
				'//default:Function[@name="Prot"]',
				'//v2019C1:Application',
				'//v2019C1:ApplicationSclRef',
			],
		},
		'the application left out alone → the functions it composes, without it': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['hmi-s'],
			expectedQueries: [
				`${BAY}/default:Function[@name="Prot"]`,
				`${BAY}/default:Function[@name="Disp"]`,
			],
			unexpectedQueries: ['//v2019C1:Application', '//v2019C1:ApplicationSclRef'],
		},
		'everything left out → nothing is written': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['hmi-s', 'protection-s', 'display-s'],
			unexpectedQueries: ['//default:Function', '//v2019C1:Application'],
		},
		'a function left out, the application kept → refused, nothing is written': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['protection-s'],
			refused: true,
			unexpectedQueries: ['//default:Function', '//v2019C1:Application'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		}

		const placementReport = await report(target.query, lifecycleTarget)

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
			await apply(tx, { ...lifecycleTarget, report: placementReport, resolution: { decisions } })
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
