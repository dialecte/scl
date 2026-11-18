import isdTemplateTwoBays from '../integration/ied/fixtures/isd-template-of-a-bay-controller-on-two-bays-revised-gaining-supervision.xml?raw'
import isdTemplateSupervised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-with-a-supervision-function.xml?raw'
import projectNorthTwoBays from '../integration/ied/fixtures/project-north-with-bcu1-placed-on-two-bays.xml?raw'
import projectNorthMovedOffPlacedQ01 from '../integration/ied/fixtures/project-north-with-line-protection-moved-off-q01-placed-from-the-template-bay.xml?raw'
import projectNorthMovedOntoOtherFileBay from '../integration/ied/fixtures/project-north-with-line-protection-moved-onto-a-bay-of-another-file.xml?raw'
import projectNorthMovedOntoBareBay from '../integration/ied/fixtures/project-north-with-line-protection-moved-onto-another-bare-bay.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type WarningCase = SclTest.BaseXmlTestCase & {
	/** The warnings the report gives on the specification: `<code> <uuid of the template element>`, sorted. */
	warnings: string[]
}

// A function the revision gains is placed once, in the bay the template puts it. The IED's specification on several
// bays of a single-bay template (the project moved part of it): the bay carrying the template bay's lineage, else the
// only one carrying none (the one the template's bay was mapped onto); a template on several bays places it in its own
// bay, the unit being the voltage level holding them.
describe('tx.lifecycle.apply - an S-IED update gaining a function, its specification on several bays', () => {
	const testCases: SclTest.TestCases = {
		'LineProtection moved onto Q02, Q01 placed from the template bay, the revision gaining Supervision → Supervision placed once, on Q01':
			{
				sourceXml: isdTemplateSupervised,
				targetXml: projectNorthMovedOffPlacedQ01,
				expectedQueries: [
					'/default:SCL[count(//default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"])=1]//default:Bay[@name="Q01"]/default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"]',
				],
			},
		'LineProtection moved onto Q02 placed from another file, Q01 the template bay mapped onto, the revision gaining Supervision → Supervision placed once, on Q01':
			{
				sourceXml: isdTemplateSupervised,
				targetXml: projectNorthMovedOntoOtherFileBay,
				expectedQueries: [
					'/default:SCL[count(//default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"])=1]//default:Bay[@name="Q01"]/default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"]',
				],
			},
		'LineProtection moved onto Q02, neither bay carrying a lineage, the revision gaining Supervision → Supervision placed nowhere':
			{
				sourceXml: isdTemplateSupervised,
				targetXml: projectNorthMovedOntoBareBay,
				unexpectedQueries: [
					'//default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"]',
				],
			},
		'a template on two bays (E1 holding Q01 and Q02), the revision gaining Supervision on Q02 → Supervision placed once, on Q02':
			{
				sourceXml: isdTemplateTwoBays,
				targetXml: projectNorthTwoBays,
				expectedQueries: [
					'/default:SCL[count(//default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"])=1]//default:Bay[@name="Q02"]/default:Function[@templateUuid="a0000000-0000-4000-8000-000000000007"]',
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
		await target.transaction(async function applyUpdate(tx) {
			await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Where no bay is singled out, the report says the gained function is not placed.
describe('query.lifecycle.report - an S-IED update gaining a function, no bay singled out', () => {
	const testCases: SclTest.TestCases<WarningCase> = {
		'LineProtection moved onto Q02, neither bay carrying a lineage, the revision gaining Supervision → Supervision warned of':
			{
				sourceXml: isdTemplateSupervised,
				targetXml: projectNorthMovedOntoBareBay,
				warnings: ['specification-instance-unresolved a0000000-0000-4000-8000-000000000007'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<WarningCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const unresolved = (report.warnings ?? []).flatMap((warning) =>
			warning.code === 'specification-instance-unresolved' ? [warning] : [],
		)
		const uuids = await uuidsOf({
			query: lifecycle.sourceQuery,
			elements: unresolved.map((warning) => warning.source as Scl.Ref<Scl.ElementsOf>),
		})
		const listed = unresolved.map((warning, position) => `${warning.code} ${uuids[position]}`)
		expect(listed.sort()).toEqual(testCase.warnings)
	}

	runSclTestCases.withoutExport({ testCases, act })
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

/** The uuid of each element, in order: empty for one the document does not hold. */
async function uuidsOf(params: {
	query: Core.Query<Config>
	elements: readonly Scl.Ref<Scl.ElementsOf>[]
}): Promise<string[]> {
	const records = await params.query.any.getRecords([...params.elements])
	return records.map((record) =>
		record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : '',
	)
}

/** The root of the project. */
async function projectRoot(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
