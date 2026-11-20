import movingBayControl from './fixtures/isd-template-of-a-bay-controller-on-two-bays-revised-moving-bay-control-to-q02.xml?raw'
import projectWithBcu2Reading from './fixtures/project-north-with-bcu1-on-two-bays-and-bcu2-reading-bay-control.xml?raw'
import projectWithBcu1Reading from './fixtures/project-north-with-bcu1-on-two-bays-reading-its-own-bay-control.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** BCU1's BayControl, and the input of BCU2's Alarming reading its CSWI1. */
const BCU1_BAY_CONTROL_UUID = 'b0000000-0000-4000-8000-000000000004'
const ALARMING_INPUT_UUID = 'e0000000-0000-4000-8000-000000000003'

type ReferrerCase = SclTest.BaseXmlTestCase & {
	/** The moved group of BCU1's update report: `moved <tag> <requiresDecision or -> <suggestedAction>`. */
	expectedMove: string
	/** The impacts listed on other IEDs, `<ied> <effect> <tag>`, sorted. */
	expectedImpacts: string[]
}

// BCU2's Alarming (the project's own, in Q02) reads BayControl's CSWI1 by path; the revision of BCU1's template moves
// BayControl (a…004) from Q01 to Q02.
describe('query.lifecycle.report - an S-IED update moving a function the input of another IED reads', () => {
	const testCases: SclTest.TestCases<ReferrerCase> = {
		// the path of BCU2's input names Q01: it follows the move, so the move waits for a decision
		'BayControl moved, BCU2 reading its CSWI1 → the move waiting for a decision, BCU2 renamed': {
			sourceXml: movingBayControl,
			targetXml: projectWithBcu2Reading,
			expectedMove: 'moved Function changes-another-ied skip',
			expectedImpacts: ['BCU2 renamed SourceRef'],
		},
		// the input is BCU1's own specification: it follows the move with it, no other IED changes
		'BayControl moved, an input of BCU1 itself reading its CSWI1 → the move suggested accept, nothing listed':
			{
				sourceXml: movingBayControl,
				targetXml: projectWithBcu1Reading,
				expectedMove: 'moved Function - accept',
				expectedImpacts: [],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<ReferrerCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const moves = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.change === 'moved')
			.map(
				(group) =>
					`moved ${group.primary.tagName} ${group.requiresDecision ?? '-'} ${group.suggestedAction}`,
			)
		expect(moves).toEqual([testCase.expectedMove])
		const impacts = (report.otherIedImpacts ?? []).map(
			(impact) => `${impact.ied} ${impact.effect} ${impact.element.tagName}`,
		)
		expect(impacts.sort()).toEqual(testCase.expectedImpacts)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, BayControl moves to Q02, the same record, and BCU2's input names it there.
describe('tx.lifecycle.apply - an S-IED update moving a function the input of another IED reads', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		"BayControl moved, every group accepted → BCU2's input names CSWI1 under Q02, the same input": {
			sourceXml: movingBayControl,
			targetXml: projectWithBcu2Reading,
			expectedQueries: [
				`//default:Bay[@name="Q02"]/default:Function[@uuid="${BCU1_BAY_CONTROL_UUID}"]`,
				`//v2019C1:SourceRef[@uuid="${ALARMING_INPUT_UUID}"][@source="North/E1/Q02/BayControl/CSWI1.Pos.stVal"][@sourceLNodeUuid="b0000000-0000-4000-8000-000000000011"]`,
			],
			unexpectedQueries: ['//default:Bay[@name="Q01"]/default:Function'],
		},
	}

	async function act({
		project,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lineage = { tagName: 'SourceRef', attributes: { uuid: ALARMING_INPUT_UUID } } as const
		const [before] = await target.query.findByAttributes(lineage)
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: movingBayControl })
		const report = await target.query.lifecycle.report(lifecycle)
		const decisions = acceptEvery(report.instances.flatMap((instance) => instance.groups))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		const [after] = await target.query.findByAttributes(lineage)
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
	project: SclTest.ActParams<ReferrerCase>['project']
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
