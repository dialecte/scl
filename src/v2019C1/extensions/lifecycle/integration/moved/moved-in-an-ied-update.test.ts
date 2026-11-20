import projectNorthWithSub1 from '../ied/fixtures/project-north-with-bcu1-and-sub1-subscribing-to-it.xml?raw'
import isdTemplateDroppingProtRetypingPtrc from './fixtures/isd-template-of-a-bay-controller-revised-dropping-prot-keeping-ptrc-in-ctrl-retyped.xml?raw'
import isdTemplateDroppingProt from './fixtures/isd-template-of-a-bay-controller-revised-dropping-prot-keeping-ptrc-in-ctrl.xml?raw'
import isdTemplateMovingPtrcIntoNewDeviceAsPtrc2 from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-into-a-new-device-as-ptrc2.xml?raw'
import isdTemplateMovingPtrcIntoNewDevice from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-into-a-new-device.xml?raw'
import isdTemplateMovingPtrcAsPtrc2 from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-to-ctrl-as-ptrc2.xml?raw'
import isdTemplateMovingPtrc from './fixtures/isd-template-of-a-bay-controller-revised-moving-ptrc-to-ctrl.xml?raw'
import isdTemplateSwappingPtrcAndCilo from './fixtures/isd-template-of-a-bay-controller-revised-swapping-ptrc-and-cilo.xml?raw'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup, DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type MovedCase = SclTest.BaseXmlTestCase & {
	/** The groups of the report on a moved element: `<change> <tag> <suggested> [<waiting reason>] from <old parent> to <new parent>`. */
	moved: string[]
	/** What the report lists the update would change in another IED: `<ied> <effect> <uuid of the element>`, sorted. */
	impacts: string[]
}

// An element the revision moves to another parent is one change, `moved`, from where it is to where the revision puts
// it; a reference in another IED whose names follow it makes its group wait for a decision.
describe('query.lifecycle.report - an S-IED update moving a logical node another IED names', () => {
	const testCases: SclTest.TestCases<MovedCase> = {
		'the revision moving PTRC1 from PROT to CTRL, SUB1 subscribing to PTRC1.Tr.general → PTRC1 moved, waiting for a decision, SUB1 renamed':
			{
				// the revision: PTRC1 (a…024) under CTRL instead of PROT; SUB1's input c…006 names BCU1's PTRC1 (b…024) in PROT
				sourceXml: isdTemplateMovingPtrc,
				targetXml: projectNorthWithSub1,
				moved: ['moved LN skip changes-another-ied from PROT to CTRL'],
				impacts: ['SUB1 renamed c0000000-0000-4000-8000-000000000006'],
			},
		// the revision drops PROT and keeps PTRC1 under CTRL: PTRC1 is moved, not removed with PROT
		'the revision removing PROT while PTRC1 moves out of it to CTRL → SUB1 renamed only, nothing of it deleted or cleared':
			{
				sourceXml: isdTemplateDroppingProt,
				targetXml: projectNorthWithSub1,
				moved: ['moved LN skip changes-another-ied from PROT to CTRL'],
				impacts: ['SUB1 renamed c0000000-0000-4000-8000-000000000006'],
			},
		// the same, PTRC1 now of a type holding Op only: SUB1's input names Tr.general, which the moved PTRC1 no longer holds,
		// so it is deleted (not renamed: the input goes)
		'the revision removing PROT while PTRC1 moves out of it retyped without Tr → SUB1 input deleted, naming deleted data':
			{
				sourceXml: isdTemplateDroppingProtRetypingPtrc,
				targetXml: projectNorthWithSub1,
				moved: ['moved LN skip changes-another-ied from PROT to CTRL'],
				impacts: ['SUB1 deleted c0000000-0000-4000-8000-000000000006'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<MovedCase>): Promise<void> {
		if (!target) throw new Error('target required')
		await expect(
			movesReported({ project, target, sourceXml: testCase.sourceXml }),
		).resolves.toEqual({
			moved: testCase.moved,
			impacts: testCase.impacts,
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type GroupsCase = SclTest.BaseXmlTestCase & {
	/**
	 * The device and logical node groups of the report, by `describeGroup`, sorted: `<change> <tag> <name>`, the move's
	 * old and new devices, the attributes it changes on top, the groups it depends on.
	 */
	groups: string[]
}

// A move is one change whatever else changes: a rename on top rides on it, two moves are two groups, a move into a
// device the revision adds depends on that device's addition, and a device removed while a logical node moves out of
// it waits for that move.
describe('query.lifecycle.report - an S-IED update moving logical nodes', () => {
	const testCases: SclTest.TestCases<GroupsCase> = {
		// the revision: PTRC1 (a…024) under CTRL as PTRC2
		'PTRC1 moved from PROT to CTRL and renamed PTRC2 → one moved group carrying the new instance': {
			sourceXml: isdTemplateMovingPtrcAsPtrc2,
			targetXml: projectNorthWithSub1,
			groups: ['moved LN PTRC1 from PROT to CTRL changing inst'],
		},
		// the revision: PTRC1 under CTRL, CILO1 (a…022) under PROT
		'PTRC1 moved to CTRL and CILO1 to PROT → two moved groups': {
			sourceXml: isdTemplateSwappingPtrcAndCilo,
			targetXml: projectNorthWithSub1,
			groups: ['moved LN CILO1 from CTRL to PROT', 'moved LN PTRC1 from PROT to CTRL'],
		},
		// the revision: a device SUP (a…040) holding PTRC1
		'PTRC1 moved into a device the revision adds → the device added, the move depending on it': {
			sourceXml: isdTemplateMovingPtrcIntoNewDevice,
			targetXml: projectNorthWithSub1,
			groups: [
				'added LDevice SUP',
				'moved LN PTRC1 from PROT to SUP depending on added LDevice SUP',
			],
		},
		// the revision: a device SUP holding PTRC1 as PTRC2
		'PTRC1 moved into a device the revision adds and renamed PTRC2 → the move carrying the new instance':
			{
				sourceXml: isdTemplateMovingPtrcIntoNewDeviceAsPtrc2,
				targetXml: projectNorthWithSub1,
				groups: [
					'added LDevice SUP',
					'moved LN PTRC1 from PROT to SUP changing inst depending on added LDevice SUP',
				],
			},
		// the revision: PROT gone, PTRC1 under CTRL
		'PROT removed while PTRC1 moves out of it to CTRL → the removal depending on the move': {
			sourceXml: isdTemplateDroppingProt,
			targetXml: projectNorthWithSub1,
			groups: [
				'moved LN PTRC1 from PROT to CTRL',
				'removed LDevice PROT depending on moved LN PTRC1',
			],
		},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<GroupsCase>): Promise<void> {
		if (!target) throw new Error('target required')
		await expect(
			deviceAndNodeGroups({ project, target, sourceXml: testCase.sourceXml }),
		).resolves.toEqual(testCase.groups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type RemovalCase = SclTest.BaseXmlTestCase & {
	/** What the removal of PROT takes, by its group: `<tag> <lnClass>` of each element listed, sorted. */
	takes: string[]
}

// What a removal takes never includes what the revision moves out of it: that is listed once, as a move.
describe('query.lifecycle.report - the removal of a device a logical node moves out of', () => {
	const testCases: SclTest.TestCases<RemovalCase> = {
		// the revision drops PROT and keeps PTRC1 under CTRL: PROT takes its LLN0, LPHD1 and PTOC1, not PTRC1
		'PROT removed, PTRC1 moved out of it to CTRL → the removal takes LLN0, LPHD1 and PTOC1, not PTRC1':
			{
				sourceXml: isdTemplateDroppingProt,
				targetXml: projectNorthWithSub1,
				takes: ['LN LPHD', 'LN PTOC', 'LN0 LLN0'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<RemovalCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const removal = report.instances
			.flatMap((instance) => instance.groups)
			.find((group) => group.change === 'removed' && group.primary.tagName === 'LDevice')
		const taken = removal ? logicalNodesBelow(removal.primary) : []
		const classes = await lnClassesOf({ query: target.query, nodes: taken })
		expect(classes.sort()).toEqual(testCase.takes)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The logical nodes of a diff subtree. */
function logicalNodesBelow(node: DiffNode): DiffNode[] {
	const own = node.tagName === 'LN' || node.tagName === 'LN0' ? [node] : []
	return [...own, ...node.children.flatMap(logicalNodesBelow)]
}

/** `<tag> <lnClass>` of each node's instance element. */
async function lnClassesOf(params: {
	query: Core.Query<Config>
	nodes: readonly DiffNode[]
}): Promise<string[]> {
	const refs = params.nodes.flatMap((node) => (node.instanceRef ? [node.instanceRef] : []))
	const records = await params.query.any.getRecords(refs)
	return records.flatMap((record) =>
		record
			? [`${record.tagName} ${readAttribute({ record, name: 'lnClass', defaults: 'none' })}`]
			: [],
	)
}

type SummaryCase = SclTest.BaseXmlTestCase & {
	/** The report's summary of the update: what it adds, removes and moves (the IED's own record of the revision aside). */
	summary: { added: number; removed: number; moved: number }
}

// A move is counted as one: a report whose only changes are moves is not read as up to date.
describe('query.lifecycle.report - the summary of an S-IED update moving logical nodes', () => {
	const testCases: SclTest.TestCases<SummaryCase> = {
		// the revision: PTRC1 under CTRL, CILO1 under PROT, nothing else of the tree changed
		'PTRC1 moved to CTRL and CILO1 to PROT → two moved, nothing added or removed': {
			sourceXml: isdTemplateSwappingPtrcAndCilo,
			targetXml: projectNorthWithSub1,
			summary: { added: 0, removed: 0, moved: 2 },
		},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<SummaryCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		expect(report.summary).toMatchObject(testCase.summary)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The moved groups of the report of BCU1's update, and what it changes in another IED. */
async function movesReported(params: {
	project: Project
	target: Target
	sourceXml: string
}): Promise<{ moved: string[]; impacts: string[] }> {
	const lifecycle = await updateOfBcu1(params)
	const report = await params.target.query.lifecycle.report(lifecycle)
	const groups = report.instances.flatMap((instance) => instance.groups)
	const moved = groups.filter((group) => group.change === 'moved')
	const impacts = report.otherIedImpacts ?? []
	const uuids = await uuidsOf({
		query: params.target.query,
		elements: impacts.map((impact) => impact.element),
	})
	return {
		moved: await Promise.all(
			moved.map((group) => describeMoved({ query: params.target.query, group })),
		),
		impacts: impacts
			.map((impact, position) => `${impact.ied} ${impact.effect} ${uuids[position]}`)
			.sort(),
	}
}

/** `<change> <tag> <suggested> [<waiting reason>] from <old parent inst> to <new parent inst>`. */
async function describeMoved(params: {
	query: Core.Query<Config>
	group: DecisionGroup
}): Promise<string> {
	const { query, group } = params
	const { primary } = group
	const [from] = primary.movedFrom ? await query.any.getRecords([primary.movedFrom]) : [undefined]
	const [to] = primary.movedTo ? await query.any.getRecords([primary.movedTo]) : [undefined]
	const waiting = group.requiresDecision ? ` ${group.requiresDecision}` : ''
	return `${group.change} ${primary.tagName} ${group.suggestedAction}${waiting} from ${instOf(from)} to ${instOf(to)}`

	function instOf(record: typeof from): string | undefined {
		return record ? readAttribute({ record, name: 'inst', defaults: 'none' }) : '?'
	}
}

/** The LDevice and LN groups of the report of BCU1's update, each by `describeGroup`, sorted. */
async function deviceAndNodeGroups(params: {
	project: Project
	target: Target
	sourceXml: string
}): Promise<string[]> {
	const lifecycle = await updateOfBcu1(params)
	const report = await params.target.query.lifecycle.report(lifecycle)
	const groups = report.instances
		.flatMap((instance) => instance.groups)
		.filter((group) => group.primary.tagName === 'LDevice' || group.primary.tagName === 'LN')
		.filter((group) => group.change !== 'modified')
	const byId = new Map(groups.map((group) => [group.id, group]))
	const described = await Promise.all(
		groups.map((group) =>
			describeGroup({
				query: params.target.query,
				sourceQuery: lifecycle.sourceQuery,
				group,
				byId,
			}),
		),
	)
	return described.sort()
}

/** `<change> <tag> <name>[ from <old device> to <new device>][ changing <attributes>][ depending on <change> <tag> <name>]`. */
async function describeGroup(params: {
	query: Core.Query<Config>
	sourceQuery: Core.Query<Config>
	group: DecisionGroup
	byId: ReadonlyMap<string, DecisionGroup>
}): Promise<string> {
	const { group } = params
	const name = await nameOf(params)
	const move =
		group.change === 'moved'
			? ` from ${await deviceName({ ...params, ref: group.primary.movedFrom })} to ${await deviceName({ ...params, ref: group.primary.movedTo })}`
			: ''
	const changed = (group.primary.attributeChanges ?? []).map((change) => change.name).sort()
	const changing = changed.length > 0 ? ` changing ${changed.join(' ')}` : ''
	const dependencies = await Promise.all(
		group.dependsOn.flatMap((id) => {
			const dependency = params.byId.get(id)
			return dependency ? [describeName({ ...params, group: dependency })] : []
		}),
	)
	const depending = dependencies.length > 0 ? ` depending on ${dependencies.sort().join(', ')}` : ''
	return `${group.change} ${group.primary.tagName} ${name}${move}${changing}${depending}`
}

/** `<change> <tag> <name>` of a group. */
async function describeName(params: {
	query: Core.Query<Config>
	sourceQuery: Core.Query<Config>
	group: DecisionGroup
}): Promise<string> {
	return `${params.group.change} ${params.group.primary.tagName} ${await nameOf(params)}`
}

/** A device's `inst`, or a logical node's prefix, class and instance, read from the project, else from the template. */
async function nameOf(params: {
	query: Core.Query<Config>
	sourceQuery: Core.Query<Config>
	group: DecisionGroup
}): Promise<string> {
	const { primary } = params.group
	const ref = primary.instanceRef ?? primary.sourceRef
	const reader = primary.instanceRef ? params.query : params.sourceQuery
	const [record] = ref ? await reader.any.getRecords([ref]) : [undefined]
	if (!record) return '?'
	if (record.tagName === 'LDevice')
		return readAttribute({ record, name: 'inst', defaults: 'none' }) ?? '?'
	const found = record
	return `${read('prefix')}${read('lnClass')}${read('inst')}`

	function read(name: string): string {
		return readAttribute({ record: found, name, defaults: 'none' }) ?? ''
	}
}

/** The `inst` of a device a move names, read from the project, else from the template. */
async function deviceName(params: {
	query: Core.Query<Config>
	sourceQuery: Core.Query<Config>
	ref: DecisionGroup['primary']['movedFrom']
}): Promise<string> {
	if (!params.ref) return '?'
	const [held] = await params.query.any.getRecords([params.ref])
	const [record] = held ? [held] : await params.sourceQuery.any.getRecords([params.ref])
	return record ? (readAttribute({ record, name: 'inst', defaults: 'none' }) ?? '?') : '?'
}

/** The uuid of each element. */
async function uuidsOf(params: {
	query: Core.Query<Config>
	elements: readonly { tagName: string; id: string }[]
}): Promise<string[]> {
	const records = await params.query.any.getRecords([...params.elements])
	return records.map((record) =>
		record ? readAttribute({ record, name: 'uuid', defaults: 'none' }) : '',
	)
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
