import openSpecificationXml from '../integration/ied/fixtures/isd-bcu1-specification-version-1.xml?raw'
import otherSpecificationXml from '../integration/ied/fixtures/isd-bcu1-specification-version-2.xml?raw'
import openWithInputXml from '../integration/ied/fixtures/isd-bcu1-version-1-with-an-input.xml?raw'
import openBayControlOnBcu9Xml from '../integration/ied/fixtures/isd-bcu1-version-1-with-bay-control-specified-on-bcu9.xml?raw'
import openIsdXml from '../integration/ied/fixtures/isd-bcu1-version-1.xml?raw'
import inputFromGainedXml from '../integration/ied/fixtures/isd-bcu1-version-2-input-from-a-gained-lnode.xml?raw'
import inputFromMissingXml from '../integration/ied/fixtures/isd-bcu1-version-2-input-from-a-missing-lnode.xml?raw'
import inputFromBcu9Xml from '../integration/ied/fixtures/isd-bcu1-version-2-input-from-an-lnode-of-bcu9.xml?raw'
import inputFromCilo1Xml from '../integration/ied/fixtures/isd-bcu1-version-2-input-from-cilo1.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type Decide = (groups: readonly DecisionGroup[]) => DecisionMap

type RetargetCase = SclTest.BaseXmlTestCase & {
	/** The open ISD, and the other version of it the fork takes. */
	openXml: string
	otherXml: string
	decide: Decide
}

// In a fork, a reference the newer revision points at another element is written by its uuid; the commit writes its
// path from it. PTOC's input b…050 is fed by BayControl's CSWI1 (b…011) in the open ISD, by CILO1 (b…012) in revision 2.
describe('tx.lifecycle.apply - a fork re-targeting a reference', () => {
	const testCases: SclTest.TestCases<RetargetCase> = {
		'the input fed by CILO1 in revision 2, accepted → its source names CILO1, its path written from it':
			{
				sourceXml: openIsdXml,
				openXml: openWithInputXml,
				otherXml: inputFromCilo1Xml,
				decide: (groups) => decideAll({ groups, action: () => 'accept' }),
				expectedQueries: [
					'//v2019C1:SourceRef[@uuid="b0000000-0000-4000-8000-000000000050"][@sourceLNodeUuid="b0000000-0000-4000-8000-000000000012"][starts-with(@source, "North/E1/Q01/BayControl/CILO1")]',
				],
			},
		// the new target is added by the same reconcile, after the input is compared
		'the input fed by an LNode LineProtection gains in revision 2, accepted → its source names that LNode':
			{
				sourceXml: openIsdXml,
				openXml: openWithInputXml,
				otherXml: inputFromGainedXml,
				decide: (groups) => decideAll({ groups, action: () => 'accept' }),
				expectedQueries: [
					'//default:Function[@name="LineProtection"]/default:LNode[@uuid="b0000000-0000-4000-8000-000000000060"]',
					'//v2019C1:SourceRef[@uuid="b0000000-0000-4000-8000-000000000050"][@sourceLNodeUuid="b0000000-0000-4000-8000-000000000060"][starts-with(@source, "North/E1/Q01/LineProtection/GGIO1")]',
				],
			},
		'the input fed by CILO1 in revision 2, skipped → still fed by CSWI1': {
			sourceXml: openIsdXml,
			openXml: openWithInputXml,
			otherXml: inputFromCilo1Xml,
			decide: (groups) => decideAll({ groups, action: () => 'skip' }),
			expectedQueries: [
				'//v2019C1:SourceRef[@sourceLNodeUuid="b0000000-0000-4000-8000-000000000011"][@source="North/E1/Q01/BayControl/CSWI1.Pos.stVal"]',
			],
		},
		'the input fed by an LNode added to a function the update leaves out, accepted → still fed by CSWI1':
			{
				sourceXml: openIsdXml,
				openXml: openBayControlOnBcu9Xml,
				otherXml: inputFromBcu9Xml,
				decide: (groups) => decideAll({ groups, action: () => 'accept' }),
				expectedQueries: [
					'//v2019C1:SourceRef[@sourceLNodeUuid="b0000000-0000-4000-8000-000000000011"][@source="North/E1/Q01/BayControl/CSWI1.Pos.stVal"]',
				],
				unexpectedQueries: ['//default:LNode[@uuid="b0000000-0000-4000-8000-000000000061"]'],
			},
		'revision 2 naming an LNode no version holds, accepted → the input still fed by CSWI1': {
			sourceXml: openIsdXml,
			openXml: openWithInputXml,
			otherXml: inputFromMissingXml,
			decide: (groups) => decideAll({ groups, action: () => 'accept' }),
			expectedQueries: [
				'//v2019C1:SourceRef[@sourceLNodeUuid="b0000000-0000-4000-8000-000000000011"]',
			],
		},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<RetargetCase>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const refused = await reportThenApply({ open, lifecycle, decide: testCase.decide }).then(
			() => undefined,
			(error: unknown) => toDialecteError(error)?.key ?? String(error),
		)
		expect(refused).toBeUndefined()
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The re-targeted reference waits for what brings its new target: the LNode re-bound to PTRC2 depends on the IED's
// group adding PTRC2; a reference onto nothing the update brings keeps its target and the report says so.
describe('query.lifecycle.report - a fork re-targeting a reference', () => {
	const testCases: SclTest.TestCases<RetargetCase & { expected: string }> = {
		"the LNode re-bound to PTRC2, PTRC2's addition skipped → refused DECISION_DEPENDENCY_SKIPPED": {
			sourceXml: openIsdXml,
			openXml: openSpecificationXml,
			otherXml: otherSpecificationXml,
			decide: (groups) =>
				decideAll({
					groups,
					action: (group) =>
						group.change === 'added' && group.primary.tagName === 'LN' ? 'skip' : 'accept',
				}),
			expected: 'DECISION_DEPENDENCY_SKIPPED',
		},
		// BayControl is BCU9's specification, left out of BCU1's update: the LNode revision 2 adds to it is not brought
		'the input fed by an LNode added to a function the update leaves out → kept, one warning, no change listed':
			{
				sourceXml: openIsdXml,
				openXml: openBayControlOnBcu9Xml,
				otherXml: inputFromBcu9Xml,
				decide: (groups) => decideAll({ groups, action: () => 'accept' }),
				expected:
					'reference-retarget-unresolved sourceLNodeUuid b0000000-0000-4000-8000-000000000061',
			},
		'revision 2 naming an LNode no version holds → reference-retarget-unresolved on the input': {
			sourceXml: openIsdXml,
			openXml: openWithInputXml,
			otherXml: inputFromMissingXml,
			decide: (groups) => decideAll({ groups, action: () => 'accept' }),
			expected:
				'reference-retarget-unresolved sourceLNodeUuid b0000000-0000-4000-8000-000000000099',
		},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<RetargetCase & { expected: string }>): Promise<void> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const outcome = await reportThenApply({ open, lifecycle, decide: testCase.decide }).then(
			(warnings) => warnings.join(', ') || 'applied',
			(error: unknown) => toDialecteError(error)?.key ?? String(error),
		)
		expect(outcome).toBe(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The update verb given no report holds the same scope: the input re-targeted onto an LNode of a function the update
// leaves out keeps its source, and the commit goes through.
describe('tx.lifecycle.update.ied - a fork re-targeting a reference, no report', () => {
	const testCases: SclTest.TestCases<Omit<RetargetCase, 'decide'>> = {
		'the input fed by an LNode added to a function the update leaves out → still fed by CSWI1': {
			sourceXml: openIsdXml,
			openXml: openBayControlOnBcu9Xml,
			otherXml: inputFromBcu9Xml,
			expectedQueries: [
				'//v2019C1:SourceRef[@sourceLNodeUuid="b0000000-0000-4000-8000-000000000011"][@source="North/E1/Q01/BayControl/CSWI1.Pos.stVal"]',
			],
			unexpectedQueries: ['//default:LNode[@uuid="b0000000-0000-4000-8000-000000000061"]'],
		},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<Omit<RetargetCase, 'decide'>>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const refused = await open
			.transaction(async function updateWithoutReport(tx) {
				await tx.lifecycle.update.ied({
					sourceQuery: lifecycle.sourceQuery,
					iedRef: lifecycle.ref,
					anchor: lifecycle.anchor,
					fileType: 'ISD',
					scenario: 'fork',
				})
			})
			.then(
				() => undefined,
				(error: unknown) => toDialecteError(error)?.key ?? String(error),
			)
		expect(refused).toBeUndefined()
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

type Project = SclTest.ActParams<RetargetCase>['project']
type OpenDocument = Awaited<ReturnType<typeof importIsd>>
type ForkLifecycle = Awaited<ReturnType<typeof openFork>>['lifecycle']

/** Every group decided by `action`. */
function decideAll(params: {
	groups: readonly DecisionGroup[]
	action: (group: DecisionGroup) => 'accept' | 'skip'
}): DecisionMap {
	return new Map(params.groups.map((group) => [group.id, params.action(group)] as const))
}

/**
 * The fork reported, then applied as `decide` says: the report's re-target warnings, `<code> <attribute> <uuid>`, then
 * any change it lists onto the left-out LNode b…061 (`listed <attribute> <uuid>`).
 */
async function reportThenApply(params: {
	open: OpenDocument
	lifecycle: ForkLifecycle
	decide: Decide
}): Promise<string[]> {
	const { open, lifecycle, decide } = params
	const report = await open.query.lifecycle.report(lifecycle)
	const decisions = decide(report.instances.flatMap((instance) => instance.groups))
	await open.transaction(async function applyEachDecision(tx) {
		await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
	})
	const listed = report.instances
		.flatMap((instance) => instance.groups)
		.flatMap((group) => [group.primary, ...group.companions])
		.flatMap((node) => node.attributeChanges ?? [])
		.filter((change) => change.name === 'sourceLNodeUuid' && change.after?.endsWith('061'))
		.map((change) => `listed ${change.name} ${change.after}`)
	const warnings = (report.warnings ?? []).flatMap((warning) =>
		warning.code === 'reference-retarget-unresolved'
			? [`${warning.code} ${warning.attribute} ${warning.uuid}`]
			: [],
	)
	return [...warnings, ...listed]
}

/** The open ISD and the fork of its other version onto it. */
async function openFork(params: { project: Project; openXml: string; otherXml: string }) {
	const { project, openXml, otherXml } = params
	const open = await importIsd({ project, xml: openXml, fileName: 'BCU1.isd' })
	const other = await importIsd({ project, xml: otherXml, fileName: 'BCU1-r2.isd' })
	const ref = await iedNamed({ query: other.query, name: 'BCU1' })
	const anchor = await rootOf(open.query)
	const lifecycle = {
		verb: 'ied',
		scenario: 'fork',
		sourceQuery: other.query,
		ref,
		anchor,
	} as const
	return { open, lifecycle }
}

/** Import an ISD of the case into the project, under its own extension, and open it. */
async function importIsd(params: { project: Project; xml: string; fileName: string }) {
	const { project, xml, fileName } = params
	const { documentId } = await project.importFile(new File([xml], fileName, { type: 'text/xml' }))
	return project.openDocument(documentId)
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

/** The root of a document. */
async function rootOf(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
