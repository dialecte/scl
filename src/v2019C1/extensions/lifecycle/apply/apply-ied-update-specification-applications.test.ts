import isdTemplateRevised from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthTwiceWithSharedApplication from '../integration/ied/fixtures/project-north-with-bcu1-and-bcu1-1-on-q01-and-an-application-composing-both.xml?raw'
import projectNorthWithApplication from '../integration/ied/fixtures/project-north-with-bcu1-and-its-protection-application.xml?raw'
import projectNorthQ01PlacedWithApplication from '../integration/ied/fixtures/project-north-with-q01-placed-from-the-template-bay-and-its-protection-application.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type ApplicationCase = SclTest.BaseXmlTestCase & {
	/** The groups of the report on an Application: `<change> <tag>`, sorted. */
	groups: string[]
}

// An application of the IED's specification is one composing a function of it. One the revision no longer holds is
// listed as a function is: the project's own on a bay the template's bay was mapped onto, removed on one the placement
// made.
describe('query.lifecycle.report - an S-IED update dropping an application of its specification', () => {
	const testCases: SclTest.TestCases<ApplicationCase> = {
		'ProtectionApp composing LineProtection on Q01, the template bay mapped onto, the revision without it → listed as the project’s own':
			{
				// ProtectionApp (b…008, lineage a…008) composes LineProtection (b…005); no revision holds a…008
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithApplication,
				groups: ['target-only Application'],
			},
		'ProtectionApp composing LineProtection on Q01, placed from the template bay, the revision without it → listed removed':
			{
				// Q01 (b…003) carries the template bay's lineage (a…003)
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthQ01PlacedWithApplication,
				groups: ['removed Application'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<ApplicationCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const groups = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.primary.tagName === 'Application')
			.map((group) => `${group.change} ${group.primary.tagName}`)
		expect(groups.sort()).toEqual(testCase.groups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// An application composing a function another IED's specification holds too is not the IED's alone: no part of its
// specification, never listed by its update.
describe('query.lifecycle.report - an S-IED update, an application composing another IED’s function too', () => {
	const testCases: SclTest.TestCases<ApplicationCase> = {
		'ProtectionApp composing the LineProtection of BCU1 and of BCU1_1, the revision without it → not listed':
			{
				// ProtectionApp (b…008) composes LineProtection (b…005, BCU1) and LineProtection_1 (d…005, BCU1_1)
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthTwiceWithSharedApplication,
				groups: [],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<ApplicationCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const groups = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.primary.tagName === 'Application')
			.map((group) => `${group.change} ${group.primary.tagName}`)
		expect(groups.sort()).toEqual(testCase.groups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Applied at its suggested actions, the application goes from the bay the placement made and stays on the mapped one.
describe('tx.lifecycle.apply - an S-IED update dropping an application of its specification', () => {
	const testCases: SclTest.TestCases = {
		'on Q01, the template bay mapped onto, every group at its suggested action → ProtectionApp kept':
			{
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthWithApplication,
				expectedQueries: [
					'//default:Bay[@name="Q01"]/default:Private/v2019C1:Application[@uuid="b0000000-0000-4000-8000-000000000008"]',
				],
			},
		'on Q01, placed from the template bay, every group at its suggested action → ProtectionApp gone, LineProtection kept':
			{
				sourceXml: isdTemplateRevised,
				targetXml: projectNorthQ01PlacedWithApplication,
				expectedQueries: [
					'//default:Bay[@name="Q01"]/default:Function[@uuid="b0000000-0000-4000-8000-000000000005"]',
				],
				unexpectedQueries: ['//v2019C1:Application'],
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
