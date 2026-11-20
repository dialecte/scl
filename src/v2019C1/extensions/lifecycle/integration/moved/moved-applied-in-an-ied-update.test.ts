import projectNorthWithSub1 from '../ied/fixtures/project-north-with-bcu1-and-sub1-subscribing-to-it.xml?raw'
import isdTemplateDroppingCtrlMovingCilo from './fixtures/isd-template-of-a-bay-controller-revised-dropping-ctrl-moving-cilo-to-prot.xml?raw'
import isdTemplateDroppingProt from './fixtures/isd-template-of-a-bay-controller-revised-dropping-prot-keeping-ptrc-in-ctrl.xml?raw'
import isdTemplateMovingPtrcIntoNewDeviceAsPtrc2 from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-into-a-new-device-as-ptrc2.xml?raw'
import isdTemplateMovingPtrcIntoNewDevice from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-into-a-new-device.xml?raw'
import isdTemplateMovingPtrcAsPtrc2 from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-to-ctrl-as-ptrc2.xml?raw'
import isdTemplateMovingPtrc from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-to-ctrl.xml?raw'
import isdTemplateSwappingPtrcAndCilo from './fixtures/isd-template-of-a-bay-controller-revised-swapping-ptrc-and-cilo.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type Decide = (groups: readonly DecisionGroup[]) => Map<string, 'accept' | 'skip'>

type AppliedCase = SclTest.BaseXmlTestCase & {
	/** The decisions, from the report's groups. */
	decide: Decide
	/** The record id BCU1's PTRC1 keeps, when the case checks it moved in place. */
	keepsRecordOfPtrc1?: boolean
}

/** Every group accepted. */
function acceptEvery(groups: readonly DecisionGroup[]): Map<string, 'accept' | 'skip'> {
	return new Map(groups.map((group) => [group.id, 'accept'] as const))
}

/** Every group at its suggested action, but the moves skipped. */
function skipMoves(groups: readonly DecisionGroup[]): Map<string, 'accept' | 'skip'> {
	return new Map(
		groups.map(
			(group) => [group.id, group.change === 'moved' ? 'skip' : group.suggestedAction] as const,
		),
	)
}

// An accepted move writes the element under its new parent, the same record, after what the revision adds and before
// what it removes; what names it follows. A skipped move writes nothing.
describe('tx.lifecycle.apply - an S-IED update moving a logical node', () => {
	const testCases: SclTest.TestCases<AppliedCase> = {
		// PTRC1 (b…024) under PROT in BCU1, under CTRL in the revision; SUB1's input c…006 names it
		'PTRC1 moved to CTRL, every group accepted → PTRC1 under CTRL, the same record, SUB1 naming it there':
			{
				sourceXml: isdTemplateMovingPtrc,
				targetXml: projectNorthWithSub1,
				decide: acceptEvery,
				keepsRecordOfPtrc1: true,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="PTRC"][@uuid="b0000000-0000-4000-8000-000000000024"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@ldInst="CTRL"][@lnUuid="b0000000-0000-4000-8000-000000000024"]',
				],
				unexpectedQueries: ['//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"]'],
			},
		// the same revision, the move skipped
		'PTRC1 moved to CTRL, the move skipped → PTRC1 under PROT, SUB1 unchanged': {
			sourceXml: isdTemplateMovingPtrc,
			targetXml: projectNorthWithSub1,
			decide: skipMoves,
			expectedQueries: [
				'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"][@uuid="b0000000-0000-4000-8000-000000000024"]',
				'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@ldInst="PROT"]',
			],
			unexpectedQueries: ['//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="PTRC"]'],
		},
		// the revision adds a device SUP holding PTRC1
		'PTRC1 moved into the device SUP the revision adds, every group accepted → SUP holding PTRC1, held once':
			{
				sourceXml: isdTemplateMovingPtrcIntoNewDevice,
				targetXml: projectNorthWithSub1,
				decide: acceptEvery,
				keepsRecordOfPtrc1: true,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="SUP"]/default:LN[@lnClass="PTRC"][@uuid="b0000000-0000-4000-8000-000000000024"]',
				],
				unexpectedQueries: ['(//default:LN[@lnClass="PTRC"])[2]'],
			},
		// the revision drops PROT and keeps PTRC1 under CTRL
		'PROT removed and PTRC1 moved out of it, both accepted → PROT gone, PTRC1 under CTRL': {
			sourceXml: isdTemplateDroppingProt,
			targetXml: projectNorthWithSub1,
			decide: acceptEvery,
			keepsRecordOfPtrc1: true,
			expectedQueries: [
				'//default:IED[@name="BCU1"]//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="PTRC"][@uuid="b0000000-0000-4000-8000-000000000024"]',
				'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@ldInst="CTRL"][@lnUuid="b0000000-0000-4000-8000-000000000024"]',
			],
			unexpectedQueries: ['//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"]'],
		},
		// the revision drops CTRL and moves CILO1 (b…022) to PROT without its input (lineage a…036)
		'CTRL removed and CILO1 moved out of it to PROT losing its input, every group accepted → CILO1 under PROT, its input gone':
			{
				sourceXml: isdTemplateDroppingCtrlMovingCilo,
				targetXml: projectNorthWithSub1,
				decide: acceptEvery,
				keepsRecordOfPtrc1: true,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="CILO"][@uuid="b0000000-0000-4000-8000-000000000022"]',
				],
				unexpectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="CTRL"]',
					'//default:IED[@name="BCU1"]//default:ExtRef[@templateUuid="a0000000-0000-4000-8000-000000000036"]',
				],
			},
		// the revision moves PTRC1 to CTRL as PTRC2
		'PTRC1 moved to CTRL and renamed PTRC2, every group accepted → PTRC2 under CTRL, SUB1 naming PTRC2 there':
			{
				sourceXml: isdTemplateMovingPtrcAsPtrc2,
				targetXml: projectNorthWithSub1,
				decide: acceptEvery,
				keepsRecordOfPtrc1: true,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="PTRC"][@inst="2"][@uuid="b0000000-0000-4000-8000-000000000024"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@ldInst="CTRL"][@lnInst="2"]',
				],
			},
		// the revision adds SUP holding PTRC1 as PTRC2
		'PTRC1 moved into the added SUP and renamed PTRC2, every group accepted → PTRC2 under SUP, SUB1 naming it there':
			{
				sourceXml: isdTemplateMovingPtrcIntoNewDeviceAsPtrc2,
				targetXml: projectNorthWithSub1,
				decide: acceptEvery,
				keepsRecordOfPtrc1: true,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="SUP"]/default:LN[@lnClass="PTRC"][@inst="2"][@uuid="b0000000-0000-4000-8000-000000000024"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@ldInst="SUP"][@lnInst="2"]',
				],
			},
		// the revision swaps PTRC1 (to CTRL) and CILO1 (to PROT)
		'PTRC1 moved to CTRL and CILO1 to PROT, every group accepted → each under its new device, SUB1 following PTRC1':
			{
				sourceXml: isdTemplateSwappingPtrcAndCilo,
				targetXml: projectNorthWithSub1,
				decide: acceptEvery,
				keepsRecordOfPtrc1: true,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="PTRC"]',
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"]/default:LN[@lnClass="CILO"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@ldInst="CTRL"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<AppliedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		await expect(
			updateApplied({ project, target, sourceXml: testCase.sourceXml, decide: testCase.decide }),
		).resolves.toEqual({ ptrc1KeptItsRecord: testCase.keepsRecordOfPtrc1 ?? false })
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A removal taking with it an element whose move is skipped is refused: the move it depends on is decided first.
describe('tx.lifecycle.apply - an S-IED update accepting what a skipped group holds up', () => {
	const testCases: SclTest.TestCases<RefusedCase> = {
		// the revision drops PROT and keeps PTRC1 under CTRL
		'PROT removed accepted, PTRC1 moved out of it skipped → refused DECISION_DEPENDENCY_SKIPPED': {
			sourceXml: isdTemplateDroppingProt,
			targetXml: projectNorthWithSub1,
			decide: removeButSkipMoves,
		},
		// the revision adds SUP holding PTRC1
		'PTRC1 moved into the added SUP accepted, SUP skipped → refused DECISION_DEPENDENCY_SKIPPED': {
			sourceXml: isdTemplateMovingPtrcIntoNewDevice,
			targetXml: projectNorthWithSub1,
			decide: acceptButSkipAdded,
		},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<RefusedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		await expect(
			updateApplied({
				project,
				target,
				sourceXml: testCase.sourceXml,
				decide: testCase.decide,
			}).catch((error: unknown) => toDialecteError(error)?.key),
		).resolves.toBe('DECISION_DEPENDENCY_SKIPPED')
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type RefusedCase = SclTest.BaseXmlTestCase & {
	/** The decisions, from the report's groups. */
	decide: Decide
}

/** Every group accepted, but the additions skipped. */
function acceptButSkipAdded(groups: readonly DecisionGroup[]): Map<string, 'accept' | 'skip'> {
	return new Map(
		groups.map((group) => [group.id, group.change === 'added' ? 'skip' : 'accept'] as const),
	)
}

/** Every group accepted, but the moves skipped. */
function removeButSkipMoves(groups: readonly DecisionGroup[]): Map<string, 'accept' | 'skip'> {
	return new Map(
		groups.map((group) => [group.id, group.change === 'moved' ? 'skip' : 'accept'] as const),
	)
}

/** BCU1 updated from a revision of its template, as `decide` says: whether its PTRC1 kept its record. */
async function updateApplied(params: {
	project: Project
	target: Target
	sourceXml: string
	decide: Decide
}): Promise<{ ptrc1KeptItsRecord: boolean }> {
	const { target } = params
	const before = await ptrc1Of(target.query)
	const lifecycle = await updateOfBcu1(params)
	const report: DiffReport = await target.query.lifecycle.report(lifecycle)
	const decisions = params.decide(report.instances.flatMap((instance) => instance.groups))
	await target.transaction(async function applyUpdate(tx) {
		await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
	})
	const after = await ptrc1Of(target.query)
	return {
		ptrc1KeptItsRecord: before !== undefined && before === after && moved({ report, decisions }),
	}
}

/** Whether a move was accepted. */
function moved(params: {
	report: DiffReport
	decisions: ReadonlyMap<string, 'accept' | 'skip'>
}): boolean {
	return params.report.instances
		.flatMap((instance) => instance.groups)
		.some((group) => group.change === 'moved' && params.decisions.get(group.id) === 'accept')
}

/** The record id of BCU1's PTRC1 (b…024). */
async function ptrc1Of(query: Core.Query<Config>): Promise<string | undefined> {
	const [ptrc1] = await query.findByAttributes({
		tagName: 'LN',
		attributes: { uuid: 'b0000000-0000-4000-8000-000000000024' },
	})
	return ptrc1?.id
}

type Project = SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
type Target = NonNullable<SclTest.ActParams<SclTest.BaseXmlTestCase>['target']>

/** The update of BCU1 from a revision of its template ISD, the revision imported into the project as an ISD file. */
async function updateOfBcu1(params: { project: Project; target: Target; sourceXml: string }) {
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
