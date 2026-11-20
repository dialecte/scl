import projectNorthTwoBays from '../ied/fixtures/project-north-with-bcu1-placed-on-two-bays.xml?raw'
import { listGroups } from '../integration-helpers'
import movingBayControl from './fixtures/isd-template-of-a-bay-controller-on-two-bays-revised-moving-bay-control-to-q02.xml?raw'
import projectNorthTwoIeds from './fixtures/project-north-with-bcu1-and-bcu1-1-placed-on-two-bays.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** BCU1's BayControl, and BCU1_1's (its twin of the same lineage). */
const BCU1_BAY_CONTROL_UUID = 'b0000000-0000-4000-8000-000000000004'
const BCU1_1_BAY_CONTROL_UUID = 'd0000000-0000-4000-8000-000000000004'

type IedMoveCase = SclTest.BaseXmlTestCase & {
	/** The groups of BCU1's update report, `<change> <tag>`, the moved ones only, sorted. */
	expectedMoves?: string[]
	decide?: (groups: readonly DecisionGroup[]) => DecisionMap
}

// An S-IED update whose specification revision moves a function to another bay of the template's unit: one moved
// Function, scoped to the functions BCU1's specification holds.
describe('query.lifecycle.report - an S-IED update moving a function of its specification to another bay', () => {
	const testCases: SclTest.TestCases<IedMoveCase> = {
		// the template on two bays (E1 holding Q01 and Q02); the revision moves BayControl (a…004) from Q01 to Q02
		'BayControl moved from Q01 to Q02 → one moved Function': {
			sourceXml: movingBayControl,
			targetXml: projectNorthTwoBays,
			expectedMoves: ['moved Function'],
		},
		// BCU1_1's BayControl_1 carries the same lineage on the same Q01: only BCU1's own is in scope
		"BCU1 and BCU1_1 on the same bays, BayControl moved, BCU1 updated → one moved Function, BCU1's":
			{
				sourceXml: movingBayControl,
				targetXml: projectNorthTwoIeds,
				expectedMoves: ['moved Function'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<IedMoveCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		expect(listGroups(report).filter((group) => group.startsWith('moved'))).toEqual(
			testCase.expectedMoves,
		)
		const [moved] = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.change === 'moved')
		const [record] = moved?.primary.instanceRef
			? await target.query.any.getRecords([moved.primary.instanceRef])
			: [undefined]
		expect(record?.attributes.find((attribute) => attribute.name === 'uuid')?.value).toBe(
			BCU1_BAY_CONTROL_UUID,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, BCU1's BayControl moves to Q02, the same record: its LNodes stay bound to BCU1. Another specification's
// function of the same lineage stays where it is.
describe('tx.lifecycle.apply - an S-IED update moving a function of its specification to another bay', () => {
	const testCases: SclTest.TestCases<IedMoveCase> = {
		'BayControl moved, every group accepted → BayControl under Q02, its LNodes still bound to BCU1':
			{
				sourceXml: movingBayControl,
				targetXml: projectNorthTwoBays,
				decide: acceptEvery,
				expectedQueries: [
					`//default:Bay[@name="Q02"]/default:Function[@uuid="${BCU1_BAY_CONTROL_UUID}"]/default:LNode[@iedName="BCU1"][@ldInst="CTRL"][@lnClass="CSWI"][@lnUuid="b0000000-0000-4000-8000-000000000021"]`,
					`//default:Bay[@name="Q02"]/default:Function[@uuid="${BCU1_BAY_CONTROL_UUID}"]/default:LNode[@iedName="BCU1"][@ldInst="CTRL"][@lnClass="CILO"][@lnUuid="b0000000-0000-4000-8000-000000000022"]`,
				],
				unexpectedQueries: [
					'//default:Bay[@name="Q01"]/default:Function',
					`(//default:Function[@uuid="${BCU1_BAY_CONTROL_UUID}"])[2]`,
				],
			},
		"BCU1 and BCU1_1 on the same bays, BayControl moved, BCU1 updated, accepted → BCU1's moved, BCU1_1's in Q01":
			{
				sourceXml: movingBayControl,
				targetXml: projectNorthTwoIeds,
				decide: acceptEvery,
				expectedQueries: [
					`//default:Bay[@name="Q02"]/default:Function[@uuid="${BCU1_BAY_CONTROL_UUID}"]`,
					`//default:Bay[@name="Q01"]/default:Function[@uuid="${BCU1_1_BAY_CONTROL_UUID}"]/default:LNode[@iedName="BCU1_1"]`,
				],
				unexpectedQueries: [
					`//default:Bay[@name="Q02"]/default:Function[@uuid="${BCU1_1_BAY_CONTROL_UUID}"]`,
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<IedMoveCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const [before] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: BCU1_BAY_CONTROL_UUID },
		})
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const decide = testCase.decide ?? acceptEvery
		const decisions = decide(report.instances.flatMap((instance) => instance.groups))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		const [after] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { uuid: BCU1_BAY_CONTROL_UUID },
		})
		expect(after?.id).toBe(before?.id)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Every group accepted. */
function acceptEvery(groups: readonly DecisionGroup[]): DecisionMap {
	return new Map(groups.map((group) => [group.id, 'accept'] as const))
}

/** The update of BCU1 from a revision of its template ISD. */
async function updateOfBcu1(params: {
	project: SclTest.ActParams<IedMoveCase>['project']
	target: { query: Core.Query<Config> }
	sourceXml: string
}) {
	const { project, target, sourceXml } = params
	const imported = await project.importFile(
		new File([sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
	)
	const sourceQuery = project.openDocument(imported.documentId).query
	const ref = await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' })
	const anchor = await projectRoot(target.query)
	const targetInstance = await iedNamed({ query: target.query, name: 'BCU1' })
	return { verb: 'ied', sourceQuery, ref, anchor, scenario: 'template', targetInstance } as const
}

/** The IED of a document named so. */
async function iedNamed(params: {
	query: Core.Query<Config>
	name: string
}): Promise<Scl.Ref<'IED'>> {
	const [ied] = await params.query.findByAttributes({
		tagName: 'IED',
		attributes: { name: params.name },
	})
	if (!ied) throw new Error(`no IED ${params.name}`)
	return { tagName: 'IED', id: ied.id }
}

/** The root of the project. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
