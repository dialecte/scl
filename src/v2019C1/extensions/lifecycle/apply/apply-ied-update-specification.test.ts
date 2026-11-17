import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthTwiceOnQ01 from '../integration/ied/fixtures/project-north-with-bcu1-and-bcu1-1-both-specified-on-q01.xml?raw'
import projectNorthTwiceInBays from '../integration/ied/fixtures/project-north-with-bcu1-and-bcu1-1-specified-on-bays-of-their-own.xml?raw'
import projectNorth from '../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type DecidedCase = SclTest.BaseXmlTestCase & {
	/** The tags of the project's and the template's elements whose groups are skipped; every other at its suggested action. */
	skippedTags: string[]
}

// Applied, the update of an S-IED updates the specification its placement put in the project with the IED: the LNode
// the revision drops goes, the one it gains is bound to the logical node of the IED the update gave it, named for it.
describe('tx.lifecycle.apply - an S-IED update with its specification', () => {
	const testCases: SclTest.TestCases<DecidedCase> = {
		'the revision replacing the LNode PTRC of LineProtection by an LNode RREC, every group at its suggested action → the RREC LNode bound to the RREC of BCU1, the PTRC LNode gone, LineProtection keeping its name':
			{
				// LineProtection (b…005) holds the LNode b…014 bound to BCU1's PTRC; the revision drops it and gains the
				// LNode a…015 bound to the logical node RREC (a…026) it gains
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				skippedTags: [],
				expectedQueries: [
					'//default:Function[@name="LineProtection"][@uuid="b0000000-0000-4000-8000-000000000005"]/default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"][@iedName="BCU1"][@ldInst="PROT"][@lnClass="RREC"][@lnUuid=//default:IED[@name="BCU1"]//default:LN[@lnClass="RREC"]/@uuid]',
					'//default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="BCU1"][@sLnClass="RREC"]',
				],
				unexpectedQueries: [
					'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"]',
					'//default:Function[@name="FeederProtection"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<DecidedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const decisions = decide({ report, skippedTags: new Set(testCase.skippedTags) })
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The revision is recorded on the IED when anything of the file is written, its specification included; the project's
// header records nothing, and the bay the specification was mapped onto stays the only one.
describe('tx.lifecycle.apply - an S-IED update writing its specification only', () => {
	const testCases: SclTest.TestCases = {
		'the revision, every group of BCU1 skipped and the PTRC LNode removal accepted → BCU1 unchanged, the LNode gone, the revision recorded on BCU1, Q01 the only bay':
			{
				// the RREC LNode depends on RREC, skipped with BCU1's groups
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTRC"]',
					'//default:IED[@name="BCU1"]/default:IEDSourceFiles/default:SclFileReference[@fileType="ISD"][@revision="2"]',
					'/default:SCL/default:Substation/default:VoltageLevel[count(default:Bay)=1]/default:Bay[@name="Q01"]',
				],
				unexpectedQueries: [
					'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"]',
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="RREC"]',
					'/default:SCL/default:Header/default:SourceFiles',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const [ied, ...specification] = report.instances
		const skipped = new Set(ied?.groups.map((group) => group.id))
		const specificationGroups = specification.flatMap((instance) => instance.groups)
		// a group of the specification depending on a skipped one is skipped with it
		const decisions = new Map([
			...[...skipped].map((id) => [id, 'skip'] as const),
			...specificationGroups.map(
				(group) =>
					[group.id, group.dependsOn.some((id) => skipped.has(id)) ? 'skip' : 'accept'] as const,
			),
		])
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The template placed twice: the update of one IED updates its own specification, never the other's, whether both sit
// on one bay or each on its own.
describe('tx.lifecycle.apply - an S-IED update with its specification, the template placed twice', () => {
	const testCases: SclTest.TestCases = {
		'BCU1 and BCU1_1 both specified on Q01, BCU1 updated → LineProtection gains the RREC LNode bound to BCU1, LineProtection_1 unchanged':
			{
				// BCU1_1's functions (d…004, d…005) sit on Q01 beside BCU1's, their LNodes bound to BCU1_1
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthTwiceOnQ01,
				expectedQueries: [
					'//default:Function[@name="LineProtection"]/default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"][@iedName="BCU1"][@lnUuid=//default:IED[@name="BCU1"]//default:LN[@lnClass="RREC"]/@uuid]',
					'//default:Function[@name="LineProtection_1"][count(default:LNode)=2]/default:LNode[@uuid="d0000000-0000-4000-8000-000000000014"][@iedName="BCU1_1"][@lnUuid="d0000000-0000-4000-8000-000000000024"]',
				],
				unexpectedQueries: [
					'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"]',
					'//default:LNode[@iedName="BCU1_1"][@lnClass="RREC"]',
				],
			},
		'BCU1 on Q01, BCU1_1 on a bay of its own, BCU1 updated → Q01 updated, the other bay unchanged':
			{
				// BCU1_1's functions sit on the bay d…003 placed from the template's bay
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthTwiceInBays,
				expectedQueries: [
					'//default:Bay[@name="Q01"]/default:Function[@name="LineProtection"]/default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"][@iedName="BCU1"]',
					'//default:Bay[@uuid="d0000000-0000-4000-8000-000000000003"]/default:Function[@name="LineProtection"][count(default:LNode)=2]/default:LNode[@uuid="d0000000-0000-4000-8000-000000000014"][@iedName="BCU1_1"]',
				],
				unexpectedQueries: [
					'//default:Bay[@uuid="d0000000-0000-4000-8000-000000000003"]//default:LNode[@lnClass="RREC"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const decisions = decide({ report, skippedTags: new Set() })
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type RefusedCase = SclTest.BaseXmlTestCase & {
	/** The tags of the project's and the template's elements whose groups are skipped. */
	skippedTags: string[]
	/** The refusal: its key and the tag of the group accepted whose dependency is skipped. */
	expected: { key: string; dependent: string }
}

// An LNode the revision gains bound to a logical node the IED gains goes with it: accepting the LNode with the logical
// node skipped is refused before anything is written, as for any reference whose target is skipped.
describe('tx.lifecycle.apply - an S-IED update with its specification, a gained LNode without its logical node', () => {
	const testCases: SclTest.TestCases<RefusedCase> = {
		'the revision gaining RREC and the LNode bound to it, the logical node groups skipped and the LNode accepted → refused with DECISION_DEPENDENCY_SKIPPED, nothing written':
			{
				// the LNode a…015 of LineProtection is bound to the logical node RREC (a…026) BCU1 gains
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				skippedTags: ['LN'],
				expected: { key: 'DECISION_DEPENDENCY_SKIPPED', dependent: 'LNode' },
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LN[@lnClass="PTRC"]',
					'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"]',
				],
				unexpectedQueries: [
					'//default:LNode[@templateUuid="a0000000-0000-4000-8000-000000000015"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<RefusedCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const decisions = decide({ report, skippedTags: new Set(testCase.skippedTags) })
		const groups = report.instances.flatMap((instance) => instance.groups)
		const outcome = await target
			.transaction(async function applyUpdate(tx) {
				await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
			})
			.then(
				() => ({ key: undefined, dependent: undefined }),
				function refusalOf(error: unknown) {
					const refusal = toDialecteError(error)
					const meta = (refusal?.meta ?? {}) as { groupId?: string }
					const dependent = groups.find((group) => group.id === meta.groupId)
					return { key: refusal?.key, dependent: dependent?.primary.tagName }
				},
			)
		expect(outcome).toEqual(testCase.expected)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Every group at its suggested action, or skipped when its primary is of a tag named. */
function decide(params: { report: DiffReport; skippedTags: ReadonlySet<string> }) {
	const groups = params.report.instances.flatMap((instance) => instance.groups)
	return new Map(
		groups.map(
			(group) =>
				[
					group.id,
					params.skippedTags.has(group.primary.tagName) ? 'skip' : group.suggestedAction,
				] as const,
		),
	)
}

/** The update of BCU1 from a revision of its template ISD. */
async function updateOfBcu1(params: {
	project: SclTest.ActParams<SclTest.BaseXmlTestCase>['project']
	target: { query: Core.Query<Config> }
	sourceXml: string
}) {
	const { project, target, sourceXml } = params
	const imported = await project.importFile(
		new File([sourceXml], 'BCU_Template.isd', { type: 'text/xml' }),
	)
	const sourceQuery = project.openDocument(imported.documentId).query
	return {
		verb: 'ied',
		sourceQuery,
		ref: await iedNamed({ query: sourceQuery, name: 'SPECIFICATION' }),
		anchor: await projectRoot(target.query),
		scenario: 'template',
		targetInstance: await iedNamed({ query: target.query, name: 'BCU1' }),
	} as const
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
