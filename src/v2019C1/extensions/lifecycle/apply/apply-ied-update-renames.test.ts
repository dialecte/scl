import isdTemplateRenamingCtrl from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-renaming-ctrl-to-ctl.xml?raw'
import projectNorthWithSub1 from '../integration/ied/fixtures/project-north-with-bcu1-and-sub1-subscribing-to-it.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type RenameCase = SclTest.BaseXmlTestCase & {
	/** What the report lists the update would change in another IED: `<ied> <effect> <uuid of the element>`, sorted. */
	impacts: string[]
	/** The tags of the project elements whose group the report blocks, sorted. */
	blockedTags: string[]
}

// No name another IED gives an element of the updated IED changes: a name the template changes that an input of another
// IED carries is listed as a change of that IED, and the group bringing it is blocked.
describe('query.lifecycle.report - an S-IED update renaming what another IED names', () => {
	const testCases: SclTest.TestCases<RenameCase> = {
		'the revision renaming the device CTRL to CTL, SUB1 subscribing to CSWI1.Pos.stVal in it → that input listed as renamed, the device group blocked':
			{
				// the revision: CTRL renamed CTL (same uuid), PTRC replaced by RREC; SUB1: one input naming PTRC1.Tr.general
				// (c…006), one naming CTRL/CSWI1.Pos.stVal through PositionGoose (c…007)
				sourceXml: isdTemplateRenamingCtrl,
				targetXml: projectNorthWithSub1,
				impacts: [
					'SUB1 deleted c0000000-0000-4000-8000-000000000006',
					'SUB1 renamed c0000000-0000-4000-8000-000000000007',
				],
				blockedTags: ['ExtRef', 'LDevice', 'LN'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<RenameCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const impacts = report.otherIedImpacts ?? []
		const uuids = await uuidsOf({
			query: target.query,
			elements: impacts.map((impact) => impact.element),
		})
		const listed = impacts.map(
			(impact, position) => `${impact.ied} ${impact.effect} ${uuids[position]}`,
		)
		expect(listed.sort()).toEqual(testCase.impacts)
		const groups = report.instances.flatMap((instance) => instance.groups)
		const blocked = groups.filter((group) => group.blocked === 'affects-other-ied')
		expect(blocked.map((group) => group.primary.tagName).sort()).toEqual(testCase.blockedTags)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Applied at its suggested actions, the rename is not written: SUB1 keeps the names it gives, and no file revision it
// requires is raised.
describe('tx.lifecycle.apply - an S-IED update renaming what another IED names', () => {
	const testCases: SclTest.TestCases = {
		'the revision renaming the device CTRL to CTL, every group at its suggested action → CTRL kept, SUB1 unchanged':
			{
				// the revision: CTRL renamed CTL (same uuid); SUB1 subscribes to CTRL/CSWI1.Pos.stVal through PositionGoose
				sourceXml: isdTemplateRenamingCtrl,
				targetXml: projectNorthWithSub1,
				expectedQueries: [
					'//default:IED[@name="BCU1"]//default:LDevice[@inst="CTRL"][@uuid="b0000000-0000-4000-8000-000000000032"]',
					'//default:IED[@name="SUB1"]//default:ExtRef[@uuid="c0000000-0000-4000-8000-000000000007"][@ldInst="CTRL"][@srcLDInst="CTRL"]',
				],
				unexpectedQueries: [
					'//default:LDevice[@inst="CTL"]',
					'//default:IED[@name="SUB1"]/default:MinRequestedSCDFiles',
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
		const groups = report.instances.flatMap((instance) => instance.groups)
		const decisions = new Map(groups.map((group) => [group.id, group.suggestedAction] as const))
		await offered({
			call: function applyUpdate() {
				return target.transaction(async function applyDecided(tx) {
					await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
				})
			},
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

/** The uuid of each element, in order: empty for one the document no longer holds. */
async function uuidsOf(params: {
	query: Core.Query<Config>
	elements: readonly { tagName: string; id: string }[]
}): Promise<string[]> {
	const records = await params.query.any.getRecords([...params.elements])
	return records.map((record) =>
		record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : '',
	)
}
