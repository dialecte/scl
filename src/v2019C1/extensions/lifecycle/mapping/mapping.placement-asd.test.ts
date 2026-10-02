import { describe, expect } from 'vitest'

import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { buildElementPath } from '@/v2019C1/extensions/reference/query/build'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { collectReferenceViolations } from '@/v2019C1/test/assert-coherent-scl-references'

import type { DecisionMapping } from './mapping.types'
import type { Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const STRUCTURAL_TAGS: readonly string[] = TOPOLOGY_STRUCTURAL_TAGS

const applicationRef = { tagName: 'Application', id: 'application-s' } as Scl.Ref<'Application'>
const substationRef = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>
const voltageLevelRef = {
	tagName: 'VoltageLevel',
	id: 'voltage-level-t',
} as Scl.Ref<'VoltageLevel'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>
const secondBayRef = { tagName: 'Bay', id: 'second-bay-t' } as Scl.Ref<'Bay'>

// An ASD: the application sits at substation level, the function it composes was made for a bay.
const applicationXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-source-uuid" ${id}="application-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="function-role-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="function-role-content-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-source-uuid" ${id}="function-ref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="function-source-uuid" ${id}="function-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// A project with one substation, one voltage level and one bay; the voltage level holds a function.
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t">
				<Function name="Station" uuid="station-function-uuid" ${id}="station-function-t"/>
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The same project with a second bay.
const twoBaysXml = projectXml.replace(
	`<Bay name="B1" ${id}="bay-t"/>`,
	`<Bay name="B1" ${id}="bay-t"/>
				<Bay name="B2" ${id}="second-bay-t"/>`,
)

// The same project without any bay.
const noBayXml = projectXml.replace(`<Bay name="B1" ${id}="bay-t"/>`, '')

const substation = { ref: substationRef, title: 'S1', path: 'S1' }
const voltageLevel = { ref: voltageLevelRef, title: 'V1', path: 'S1/V1' }
const bay = { ref: bayRef, title: 'B1', path: 'S1/V1/B1' }
const secondBay = { ref: secondBayRef, title: 'B2', path: 'S1/V1/B2' }

const shared = { ambiguous: false, selectable: true, locked: false }
const onTheClickedSubstation = {
	...shared,
	id: 'substation-s',
	tagName: 'Substation',
	mapping: { existing: substationRef },
	reason: 'anchor',
	candidates: [substation],
}
const onTheClickedVoltageLevel = {
	...shared,
	id: 'voltage-level-s',
	tagName: 'VoltageLevel',
	mapping: { existing: voltageLevelRef },
	reason: 'anchor',
	candidates: [voltageLevel],
	dependsOn: 'substation-s',
}
const bayLevel = { ...shared, id: 'bay-s', tagName: 'Bay', dependsOn: 'voltage-level-s' }

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The project element the consumer started from. */
	anchor: Scl.Ref<Scl.ElementsOf>
	/** The consumer's choices, by source record id. */
	chosen?: [string, DecisionMapping][]
	expected: {
		/** What the report lists for the levels of the template — none when the click is the landing. */
		placement: unknown[]
		/** What the report says when the consumer started above the level the template was made for. */
		offLevel: DiffReport['offLevel']
		/** The kind of level the consumer has to choose a landing for, when there is one. */
		undecided?: string
		/** Every function and subfunction of the project once applied: its kind and where it sits. */
		functions: string[]
	}
}

describe('placement mapping — where the application of an ASD and its functions land', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'started from a bay → the click gives every level: the function lands in that bay, nothing to map':
			{
				sourceXml: applicationXml,
				targetXml: projectXml,
				anchor: bayRef,
				expected: {
					placement: [],
					offLevel: undefined,
					functions: ['Function S1/V1/B1/Prot', 'Function S1/V1/Station'],
				},
			},
		'started from a voltage level with one bay → its function was made for a bay: lands in the only bay, and the report says so':
			{
				sourceXml: applicationXml,
				targetXml: projectXml,
				anchor: voltageLevelRef,
				expected: {
					placement: [
						onTheClickedSubstation,
						onTheClickedVoltageLevel,
						{ ...bayLevel, mapping: { existing: bayRef }, reason: 'only', candidates: [bay] },
					],
					offLevel: { templateLevel: 'Bay', startedFrom: 'VoltageLevel' },
					functions: ['Function S1/V1/B1/Prot', 'Function S1/V1/Station'],
				},
			},
		'started from a voltage level with two bays → the consumer has to choose the bay': {
			sourceXml: applicationXml,
			targetXml: twoBaysXml,
			anchor: voltageLevelRef,
			expected: {
				placement: [
					onTheClickedSubstation,
					onTheClickedVoltageLevel,
					{
						...bayLevel,
						mapping: undefined,
						reason: 'none',
						ambiguous: true,
						candidates: [bay, secondBay],
					},
				],
				offLevel: { templateLevel: 'Bay', startedFrom: 'VoltageLevel' },
				undecided: 'Bay',
				functions: ['Function S1/V1/Station'],
			},
		},
		'… and chooses the second bay → the function lands there': {
			sourceXml: applicationXml,
			targetXml: twoBaysXml,
			anchor: voltageLevelRef,
			chosen: [['bay-s', { existing: secondBayRef }]],
			expected: {
				placement: [
					onTheClickedSubstation,
					onTheClickedVoltageLevel,
					{
						...bayLevel,
						mapping: { existing: secondBayRef },
						reason: 'decision',
						candidates: [bay, secondBay],
					},
				],
				offLevel: { templateLevel: 'Bay', startedFrom: 'VoltageLevel' },
				functions: ['Function S1/V1/B2/Prot', 'Function S1/V1/Station'],
			},
		},
		'started from a voltage level without any bay → a bay is created for the function': {
			sourceXml: applicationXml,
			targetXml: noBayXml,
			anchor: voltageLevelRef,
			expected: {
				placement: [
					onTheClickedSubstation,
					onTheClickedVoltageLevel,
					{ ...bayLevel, mapping: { create: { name: 'Bay' } }, reason: 'none', candidates: [] },
				],
				offLevel: { templateLevel: 'Bay', startedFrom: 'VoltageLevel' },
				functions: ['Function S1/V1/Bay/Prot', 'Function S1/V1/Station'],
			},
		},
		'started from the substation → the only voltage level, then its only bay': {
			sourceXml: applicationXml,
			targetXml: projectXml,
			anchor: substationRef,
			expected: {
				placement: [
					onTheClickedSubstation,
					{ ...onTheClickedVoltageLevel, reason: 'only' },
					{ ...bayLevel, mapping: { existing: bayRef }, reason: 'only', candidates: [bay] },
				],
				offLevel: { templateLevel: 'Bay', startedFrom: 'Substation' },
				functions: ['Function S1/V1/B1/Prot', 'Function S1/V1/Station'],
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		const decisionMappings = new Map(testCase.chosen ?? [])
		const lifecycleTarget = {
			verb: 'asd' as const,
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: testCase.anchor,
			scenario: 'instantiate' as const,
		}

		const lifecycleReport = await report(target.query, {
			...lifecycleTarget,
			resolution: { mappings: decisionMappings },
		})
		const placement = lifecycleReport.mappings.filter((mapping) =>
			STRUCTURAL_TAGS.includes(mapping.tagName),
		)
		expect(placement, 'report').toEqual(testCase.expected.placement)
		expect(lifecycleReport.offLevel, 'report').toEqual(testCase.expected.offLevel)
		expect(lifecycleReport.needsDecisions, 'report').toBe(testCase.expected.undecided !== undefined)

		const resolution = { decisions: new Map(), mappings: decisionMappings }
		if (testCase.expected.undecided) {
			// without decisions nothing is written; with decisions but no choice for the level, refused
			await target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, report: lifecycleReport })
			})
			const refused = target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, report: lifecycleReport, resolution })
			})
			await expect(refused, 'apply').rejects.toThrow(testCase.expected.undecided)
		} else {
			await target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, report: lifecycleReport, resolution })
			})
		}

		const functions: string[] = []
		for (const tagName of ['Function', 'SubFunction'] as const) {
			for (const record of await target.query.getRecordsByTagName(tagName)) {
				const elementPath = await buildElementPath(target.query, record)
				functions.push(`${tagName} ${elementPath?.path ?? ''}`)
			}
		}
		expect(functions.sort(), 'apply').toEqual(testCase.expected.functions)

		if (!testCase.expected.undecided) {
			// the application sits at the level its template says: the substation
			const [application] = await target.query.getRecordsByTagName('Application')
			const applicationAncestors = await target.query.findAncestors(application, {
				stopAtTagName: 'Substation',
			})
			const levels = applicationAncestors
				.map((ancestor) => ancestor.tagName)
				.filter((tagName) => STRUCTURAL_TAGS.includes(tagName))
			expect(levels, 'apply').toEqual(['Substation'])
		}

		const appliedXml = (await target.query.getSnapshot({ as: 'xml' })) as string
		expect(collectReferenceViolations({ xml: appliedXml }), 'apply').toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
