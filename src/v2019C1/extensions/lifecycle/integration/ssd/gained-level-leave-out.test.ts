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

const voltageLevelRef = { tagName: 'VoltageLevel', id: 'e1-s' } as Scl.Ref<'VoltageLevel'>
const substationRef = { tagName: 'Substation', id: 'substation-t' } as Scl.Ref<'Substation'>

// A voltage-level typical "E1" with one bay; the update gains a second bay holding a function.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="E1" uuid="e1-source-uuid" ${id}="e1-s">
				<Bay name="Feeder" uuid="feeder-source-uuid" ${id}="feeder-s">
					<Function name="Prot" uuid="protection-source-uuid" ${id}="protection-s"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t"/>
	</SCL>
`

/** A record id as the store types it. */
type RecordId = `${string}-${string}-${string}-${string}-${string}`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The source elements whose groups the consumer leaves out, by record id. */
	leftOut?: string[]
	/** The decisions are refused before anything is written (a dependency is left out). */
	refused?: boolean
	/** How many times the typical is placed before the update (once by default). */
	placements?: number
}

describe('update of a voltage-level typical — a gained bay left out takes the function it holds with it', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing left out → the bay and its function are added': {
			sourceXml,
			targetXml: projectXml,
			expectedQueries: ['//default:Bay[@name="Coupler"]/default:Function[@name="Ctrl"]'],
		},
		'the bay left out with its function → neither is added': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['coupler-s', 'control-s'],
			expectedQueries: ['//default:Bay[@name="Feeder"]/default:Function[@name="Prot"]'],
			unexpectedQueries: ['//default:Bay[@name="Coupler"]', '//default:Function[@name="Ctrl"]'],
		},
		'the bay left out, its function kept → refused': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['coupler-s'],
			refused: true,
			unexpectedQueries: ['//default:Bay[@name="Coupler"]', '//default:Function[@name="Ctrl"]'],
		},
		'placed twice, nothing left out → each instance gets the bay and its function': {
			sourceXml,
			targetXml: projectXml,
			placements: 2,
			expectedQueries: [
				'//default:VoltageLevel[@name="E1"]/default:Bay[@name="Coupler"]/default:Function[@name="Ctrl"]',
				'//default:VoltageLevel[@name="E1_1"]/default:Bay[@name="Coupler"]/default:Function[@name="Ctrl"]',
			],
		},
		'placed twice, the bay and its function left out → neither instance gets them': {
			sourceXml,
			targetXml: projectXml,
			placements: 2,
			leftOut: ['coupler-s', 'control-s'],
			unexpectedQueries: ['//default:Bay[@name="Coupler"]', '//default:Function[@name="Ctrl"]'],
		},
		'the function left out → the bay is added without it': {
			sourceXml,
			targetXml: projectXml,
			leftOut: ['control-s'],
			expectedQueries: ['//default:Bay[@name="Coupler"]'],
			unexpectedQueries: ['//default:Function[@name="Ctrl"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'ssd' as const,
			sourceQuery: source.query,
			ref: voltageLevelRef,
			anchor: substationRef,
		}

		// 1. the typical is placed
		for (let placement = 0; placement < (testCase.placements ?? 1); placement++) {
			const placementReport = await report(target.query, {
				...lifecycleTarget,
				scenario: 'instantiate',
			})
			await target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, scenario: 'instantiate', report: placementReport })
			})
		}

		// 2. the typical gains a bay holding a function
		await source.transaction(async (tx) => {
			const coupler = await tx.addChild(voltageLevelRef, {
				tagName: 'Bay',
				attributes: { name: 'Coupler', uuid: 'coupler-source-uuid' },
				id: 'coupler-s' as RecordId,
			})
			await tx.addChild(coupler, {
				tagName: 'Function',
				attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
				id: 'control-s' as RecordId,
			})
		})

		// 3. the update: the function depends on the bay it lands in
		const updateReport = await report(target.query, { ...lifecycleTarget, scenario: 'template' })
		const control = groupOf({ report: updateReport, sourceId: 'control-s' })
		for (const coupler of groupsOf({ report: updateReport, sourceId: 'coupler-s' })) {
			expect(control.dependsOn).toContain(coupler.id)
		}

		const leftOut = new Set(testCase.leftOut ?? [])
		const decisions: DecisionMap = new Map()
		for (const group of allGroups(updateReport)) {
			const sourceId = group.primary.sourceRef?.id ?? ''
			decisions.set(group.id, leftOut.has(sourceId) ? 'skip' : 'accept')
		}
		const applied = target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'template',
				report: updateReport,
				resolution: { decisions },
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

/** The groups adding a source element, one per instance it is added to. */
function groupsOf(params: { report: DiffReport; sourceId: string }) {
	return allGroups(params.report).filter(
		(candidate) => candidate.primary.sourceRef?.id === params.sourceId,
	)
}

/** The group adding a source element. */
function groupOf(params: { report: DiffReport; sourceId: string }) {
	const group = allGroups(params.report).find(
		(candidate) => candidate.primary.sourceRef?.id === params.sourceId,
	)
	if (!group) throw new Error(`no group adds ${params.sourceId}`)
	return group
}
