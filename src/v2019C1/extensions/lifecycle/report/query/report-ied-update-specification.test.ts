import isdTemplateSupervised from '../../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-with-a-supervision-function.xml?raw'
import isdTemplateRevised from '../../integration/ied/fixtures/isd-template-of-a-bay-controller-revised.xml?raw'
import projectNorthTwiceSupervised from '../../integration/ied/fixtures/project-north-with-bcu1-and-bcu1-1-on-q01-each-with-a-supervision.xml?raw'
import projectNorth from '../../integration/ied/fixtures/project-north-with-bcu1-placed-from-the-template-first-revision.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type SpecificationCase = SclTest.BaseXmlTestCase & {
	/**
	 * The groups the report lists for the specification of the IED: `<tag> <change> <uuid>`, the uuid of the project's
	 * element for a removal, of the template's for an addition, sorted.
	 */
	groups: string[]
}

// An S-IED update also updates the specification its placement put in the project: what the revision drops from it is
// removed, what it gains is added, each in a group of the one report.
describe('query.lifecycle.report - an S-IED update with its specification', () => {
	const testCases: SclTest.TestCases<SpecificationCase> = {
		'the revision replacing the LNode PTRC of LineProtection by an LNode RREC → the PTRC LNode removed, the RREC LNode added':
			{
				// LineProtection (b…005) holds the LNode b…014 (template a…014) bound to BCU1's PTRC; the revision drops
				// a…014 and gains the LNode a…015, bound to the logical node RREC it gains
				sourceXml: isdTemplateRevised,
				targetXml: projectNorth,
				groups: [
					'LNode added a0000000-0000-4000-8000-000000000015',
					'LNode removed b0000000-0000-4000-8000-000000000014',
				],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<SpecificationCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const [, ...specification] = report.instances
		const groups = specification.flatMap((instance) => instance.groups)
		const listed = await describeGroups({
			groups,
			target: target.query,
			source: lifecycle.sourceQuery,
		})
		expect(listed.sort()).toEqual(testCase.groups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type UnresolvedCase = SclTest.BaseXmlTestCase & {
	/** The warnings the report gives: `<code> <uuid of the template element>`, sorted. */
	warnings: string[]
	/** The uuids of the project's functions the report lists a group on, sorted. */
	functions: string[]
}

// A function of the specification holding no LNode of the IED is the IED's when its bay holds one copy of it; with
// several (the template placed twice on one bay), which is the IED's is not told: none is updated, and the report says so.
describe('query.lifecycle.report - an S-IED update, a function of its specification not told apart', () => {
	const testCases: SclTest.TestCases<UnresolvedCase> = {
		'BCU1 and BCU1_1 on Q01, each with its copy of Supervision (no LNode), the revision describing it → a warning naming Supervision, no group on either copy':
			{
				// Supervision (b…007) and Supervision_1 (d…007) both carry the lineage a…007; the revision gives it a desc
				sourceXml: isdTemplateSupervised,
				targetXml: projectNorthTwiceSupervised,
				warnings: ['specification-instance-unresolved a0000000-0000-4000-8000-000000000007'],
				functions: ['b0000000-0000-4000-8000-000000000005'],
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<UnresolvedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const unresolved = (report.warnings ?? []).flatMap((warning) =>
			warning.code === 'specification-instance-unresolved' ? [warning] : [],
		)
		const sourceUuids = await uuidsOf({
			query: lifecycle.sourceQuery,
			elements: unresolved.map((warning) => warning.source),
		})
		const listed = unresolved.map((warning, position) => `${warning.code} ${sourceUuids[position]}`)
		expect(listed.sort()).toEqual(testCase.warnings)
		const functionRoots = report.instances
			.filter((instance) => instance.groups.length > 0 && instance.rootRef?.tagName === 'Function')
			.map((instance) => instance.rootRef)
		const functions = await uuidsOf({ query: target.query, elements: functionRoots })
		expect(functions.sort()).toEqual(testCase.functions)
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

/** Each group as `<tag> <change> <uuid>`: the project element's uuid for a removal, the template's otherwise. */
async function describeGroups(params: {
	groups: readonly DecisionGroup[]
	target: Core.Query<Config>
	source: Core.Query<Config>
}): Promise<string[]> {
	const { groups } = params
	const removed = groups.map((group) => group.primary.instanceRef)
	const added = groups.map((group) => group.primary.sourceRef)
	const instanceUuids = await uuidsOf({ query: params.target, elements: removed })
	const sourceUuids = await uuidsOf({ query: params.source, elements: added })
	return groups.map(function describe(group, position) {
		const uuid = group.change === 'removed' ? instanceUuids[position] : sourceUuids[position]
		return `${group.primary.tagName} ${group.change} ${uuid}`
	})
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

/** The uuid of each element, in order: empty for none, or one the document does not hold. */
async function uuidsOf(params: {
	query: Core.Query<Config>
	elements: readonly ({ tagName: string; id?: string } | undefined)[]
}): Promise<string[]> {
	const present = params.elements.flatMap((element) =>
		element?.id ? [{ tagName: element.tagName, id: element.id }] : [],
	)
	const records = await params.query.any.getRecords(present)
	const byId = new Map(
		records.flatMap((record) =>
			record
				? [[record.id, readAttribute({ record, name: 'uuid', defaults: 'none' })] as const]
				: [],
		),
	)
	return params.elements.map((element) => (element?.id ? (byId.get(element.id) ?? '') : ''))
}
