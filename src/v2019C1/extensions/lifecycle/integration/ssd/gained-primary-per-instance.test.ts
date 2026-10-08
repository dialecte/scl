import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const typicalBayRef = { tagName: 'Bay', id: 'feeder-s' } as Scl.Ref<'Bay'>
const voltageLevelRef = {
	tagName: 'VoltageLevel',
	id: 'voltage-level-t',
} as Scl.Ref<'VoltageLevel'>

// A bay typical "Feeder" holding the function "Prot".
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-uuid" version="0" revision="1" ${id}="header-s"/>
		<Substation name="TEMPLATE" ${id}="substation-s">
			<VoltageLevel name="TEMPLATE" ${id}="voltage-level-s">
				<Bay name="Feeder" uuid="feeder-source-uuid" ${id}="feeder-s">
					<Function name="Prot" uuid="protection-source-uuid" ${id}="protection-s"/>
					<!-- gained by the update: <Function name="Ctrl"/> -->
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Header id="project" uuid="project-uuid" ${id}="header-t"/>
		<Substation name="S1" ${id}="substation-t">
			<VoltageLevel name="V1" ${id}="voltage-level-t"/>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** What the typical gains: a function (default) or an application. */
	gain?: 'function' | 'application'
	/** The bay, by name, where the user leaves the gained element out. */
	leftOutIn?: string
}

describe('update of a bay typical placed twice — what the typical gains is decided per bay', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing left out → the report lists the gained function once per bay, and each bay gets it': {
			sourceXml,
			targetXml: projectXml,
			expectedQueries: [
				'//default:Bay[@name="Feeder"]/default:Function[@name="Ctrl"]',
				'//default:Bay[@name="Feeder_1"]/default:Function[@name="Ctrl"]',
			],
		},
		'left out in the second bay → placed in the first bay only': {
			sourceXml,
			targetXml: projectXml,
			leftOutIn: 'Feeder_1',
			expectedQueries: ['//default:Bay[@name="Feeder"]/default:Function[@name="Ctrl"]'],
			unexpectedQueries: ['//default:Bay[@name="Feeder_1"]/default:Function[@name="Ctrl"]'],
		},
		'an application the typical gains, left out in the first bay → placed in the second bay only': {
			sourceXml,
			targetXml: projectXml,
			gain: 'application',
			leftOutIn: 'Feeder',
			expectedQueries: ['//default:Bay[@name="Feeder_1"]//v2019C1:Application[@name="Display"]'],
			unexpectedQueries: ['//default:Bay[@name="Feeder"]//v2019C1:Application[@name="Display"]'],
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
			ref: typicalBayRef,
			anchor: voltageLevelRef,
		}

		// 1. the typical is placed twice in the voltage level: Feeder, Feeder_1
		for (let placement = 0; placement < 2; placement++) {
			const placementReport = await report(target.query, {
				...lifecycleTarget,
				scenario: 'instantiate',
			})
			await target.transaction(async (tx) => {
				await apply(tx, { ...lifecycleTarget, scenario: 'instantiate', report: placementReport })
			})
		}

		// 2. the typical gains a function, or an application
		const gainedTag = testCase.gain === 'application' ? 'Application' : 'Function'
		await source.transaction(async (tx) => {
			if (gainedTag === 'Application') {
				await tx.addChild(typicalBayRef, {
					tagName: 'Application',
					attributes: { name: 'Display', type: 'DCS', uuid: 'display-source-uuid' },
				})
				return
			}
			await tx.addChild(typicalBayRef, {
				tagName: 'Function',
				attributes: { name: 'Ctrl', uuid: 'control-source-uuid' },
			})
		})

		// 3. the update: one first placement of "Ctrl" per bay, each with its own decision
		const updateReport = await report(target.query, { ...lifecycleTarget, scenario: 'template' })
		// the update reaches both placed bays, not the functions or applications they gain
		expect(updateReport.templateInstances.map((instance) => instance.tagName)).toEqual([
			'Bay',
			'Bay',
		])
		const controlPlacements = updateReport.instances.filter(
			(instance) => !instance.rootRef && instance.tree.tagName === gainedTag,
		)
		const bays = await target.query.getRecordsByTagName('Bay')
		const bayIdByName = new Map(
			bays.map((bay) => [
				bay.attributes.find((attribute) => attribute.name === 'name')?.value,
				bay.id,
			]),
		)
		expect(controlPlacements.map((instance) => instance.placedFor?.id).sort()).toEqual(
			[bayIdByName.get('Feeder'), bayIdByName.get('Feeder_1')].sort(),
		)
		const groupIds = controlPlacements.flatMap((instance) =>
			instance.groups.map((group) => group.id),
		)
		expect(new Set(groupIds).size).toBe(groupIds.length)

		const decisions: DecisionMap = new Map()
		for (const instance of controlPlacements) {
			const leftOut = instance.placedFor?.id === bayIdByName.get(testCase.leftOutIn)
			for (const group of instance.groups) decisions.set(group.id, leftOut ? 'skip' : 'accept')
		}
		await target.transaction(async (tx) => {
			await apply(tx, {
				...lifecycleTarget,
				scenario: 'template',
				report: updateReport,
				resolution: { decisions },
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
