import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import isdTemplateThird from '../integration/ied/fixtures/isd-template-of-a-bay-controller-third-revision-sending-lphd.xml?raw'
import projectNorthWithSub1 from '../integration/ied/fixtures/project-north-with-bcu1-and-sub1-subscribing-to-it.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { OtherIedImpact } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type ImpactCase = SclTest.BaseXmlTestCase & {
	/** What the report lists the update would change in SUB1, by the element's id. */
	impacts: Pick<OtherIedImpact, 'ied' | 'effect'>[]
	/** The tags of the project elements whose group the report blocks. */
	blockedTags: string[]
}

// An update never changes another IED: what the newer template would make the update write in another IED is listed
// with the IED, and the group bringing it can only be skipped.
describe('query.lifecycle.report - what an S-IED update would change in another IED', () => {
	const testCases: SclTest.TestCases<ImpactCase> = {
		'the revision dropping PTRC, SUB1 naming PTRC1.Tr.general → the input of SUB1 listed as deleted (no internal address), the PTRC removal and that input blocked':
			{
				// the revision replaces PTRC by RREC; SUB1 names PTRC1.Tr.general by its uuid, no internal address
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				impacts: [{ ied: 'SUB1', effect: 'deleted' }],
				blockedTags: ['ExtRef', 'LN'],
			},
		'the third revision also sending LPHD1.Proxy instead of CSWI1.Pos in PositionGoose, SUB1 subscribing to CSWI1.Pos.stVal → that input listed as unsubscribed, the entry removal blocked':
			{
				// the third revision's Positions sends LPHD1.Proxy.stVal; SUB1 subscribes to CSWI1.Pos.stVal through PositionGoose
				sourceXml: isdTemplateThird,
				targetXml: projectNorthWithSub1,
				impacts: [
					{ ied: 'SUB1', effect: 'deleted' },
					{ ied: 'SUB1', effect: 'unsubscribed' },
				],
				blockedTags: ['ExtRef', 'FCDA', 'LN'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<ImpactCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await offered({
			call: function reportUpdate() {
				return target.query.lifecycle.report(lifecycle)
			},
		})
		expect((report.otherIedImpacts ?? []).map(({ ied, effect }) => ({ ied, effect }))).toEqual(
			testCase.impacts,
		)
		const groups = report.instances.flatMap((instance) => instance.groups)
		const blocked = groups.filter((group) => group.blocked === 'affects-other-ied')
		expect(blocked.map((group) => group.primary.tagName).sort()).toEqual(testCase.blockedTags)
		expect(blocked.every((group) => group.suggestedAction === 'skip')).toBe(true)
		expect(report.needsDecisions).toBe(true)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Applied at its suggested actions, what the report blocks is not written: SUB1 is left as it is, the rest of the
// update is written.
describe('tx.lifecycle.apply - an S-IED update never changes another IED', () => {
	const testCases: SclTest.TestCases = {
		'the revision dropping PTRC that SUB1 names, every group at its suggested action → PTRC kept, RREC added, SUB1 unchanged':
			{
				// the revision replaces PTRC by RREC; SUB1 names PTRC1.Tr.general by its uuid
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][default:LN[@lnClass="PTRC"][@uuid="b0000000-0000-4000-8000-000000000024"]]/default:LN[@lnClass="RREC"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@iedName="BCU1"][@lnClass="PTRC"][@doName="Tr"][@lnUuid="b0000000-0000-4000-8000-000000000024"]',
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
		const report = await offered({
			call: function reportUpdate() {
				return target.query.lifecycle.report(lifecycle)
			},
		})
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, group.suggestedAction] as const))
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type RefusalCase = SclTest.BaseXmlTestCase & {
	/** The tag of the blocked group the consumer accepts, every other group at its suggested action. */
	acceptBlocked: string
}

// A blocked group accepted is refused before anything is written.
describe('tx.lifecycle.apply - a blocked group of an S-IED update accepted', () => {
	const testCases: SclTest.TestCases<RefusalCase> = {
		'the PTRC removal accepted though SUB1 names it → refused with UPDATE_AFFECTS_OTHER_IED, the project as it was':
			{
				// the revision replaces PTRC by RREC; SUB1 names PTRC1.Tr.general by its uuid
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithSub1,
				acceptBlocked: 'LN',
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="PROT"][not(default:LN[@lnClass="RREC"])]/default:LN[@lnClass="PTRC"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000006"][@lnUuid="b0000000-0000-4000-8000-000000000024"]',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<RefusalCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await offered({
			call: function reportUpdate() {
				return target.query.lifecycle.report(lifecycle)
			},
		})
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(
			groups.map((group) => {
				const blockedAccepted = group.blocked && group.primary.tagName === testCase.acceptBlocked
				return [group.id, blockedAccepted ? 'accept' : group.suggestedAction] as const
			}),
		)
		await target.transaction(async function applyUpdate(tx) {
			await expect(
				tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } }),
			).rejects.toMatchObject({ cause: { key: 'UPDATE_AFFECTS_OTHER_IED' } })
			expect(tx.getStagedOperations()).toEqual([])
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

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

/** What a call gives, asserting it is not refused: the update of the IED is offered. */
async function offered<Result>(params: { call: () => Promise<Result> }): Promise<Result> {
	let refusal: string | undefined
	let result: Result | undefined
	try {
		result = await params.call()
	} catch (error) {
		refusal = error instanceof Error ? error.message : String(error)
	}
	expect(refusal).toBeUndefined()
	return result as Result
}
