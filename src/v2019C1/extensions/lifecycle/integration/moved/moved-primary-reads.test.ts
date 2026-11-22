import { reportAndApply } from '../integration-helpers'
import feedersRevision1 from './fixtures/feeders-revision-1.xml?raw'
import feedersMovingCtrl from './fixtures/feeders-revision-2-moving-ctrl-to-feeder2.xml?raw'
import levelRevision1 from './fixtures/level-template-revision-1.xml?raw'
import levelMovingBayControl from './fixtures/level-template-revision-2-moving-baycontrol-to-q02.xml?raw'

import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The primaries of a process section: what the update resolves, per frame instance and per loop. */
const PRIMARY_TAGS: ReadonlySet<string> = new Set(['Application', 'Function'])

const projectSubstation = {
	tagName: 'Substation',
	id: 'project-substation',
} as Scl.Ref<'Substation'>

/** The project: one substation the voltage level template is placed in, twice. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" uuid="project-file-uuid" ${id}="project-header"/>
		<Substation name="S1" ${id}="project-substation"/>
	</SCL>
`

/** The reads that resolve the primaries during the apply, by kind. */
type PrimaryReads = {
	/** Template: a primary's ancestors read one by one. */
	templateAncestorsOneByOne: number
	/** Template: a primary's uuid read one by one (the cascade reads its own: the resolution reads none). */
	templateUuidsOneByOne: number
	/** Template: the ancestors of every primary read in one call. */
	templateAncestorsBatched: number
	/** Project: the ancestors of held primaries read in one call. */
	heldAncestries: number
	/** Project: every record of a primary tag read. */
	tagReads: number
}

type ReadsCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The revised template the update takes: it moves a primary. */
	nextXml: string
	expected: PrimaryReads
}

// The template placed twice (two frame instances), then updated: the reads that resolve its primaries do not grow with
// the primaries. Per frame instance, one read per primary tag and one ancestry read for every held primary; per later
// loop, one read of its tag; on the template, one record read and one ancestry read for every primary.
describe('tx.lifecycle.apply - the reads resolving the primaries of a template update placed twice', () => {
	const testCases: SclTest.TestCases<ReadsCase> = {
		// two standalone functions (Ctrl, Prot), Ctrl moved to Feeder2
		'two functions → the template read once, each frame instance one Function read and one ancestry read, the loop one Function read':
			{
				sourceXml: feedersRevision1,
				targetXml: projectXml,
				nextXml: feedersMovingCtrl,
				expected: {
					templateAncestorsOneByOne: 0,
					templateUuidsOneByOne: 28,
					templateAncestorsBatched: 1,
					heldAncestries: 2,
					tagReads: 11,
				},
			},
		// one application and one function (BayControl), BayControl moved to Q02
		'an application and a function → the template read once, each frame instance one read per tag and one ancestry read, each loop one read of its tag':
			{
				sourceXml: levelRevision1,
				targetXml: projectXml,
				nextXml: levelMovingBayControl,
				expected: {
					templateAncestorsOneByOne: 0,
					templateUuidsOneByOne: 28,
					templateAncestorsBatched: 1,
					heldAncestries: 2,
					tagReads: 15,
				},
			},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<ReadsCase>) {
		if (!target) throw new Error('target required')
		await placeTwice({ sourceQuery: source.query, target })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const update = await voltageLevelOf({ sourceQuery: next.query, scenario: 'template' })
		const reported = await report(target.query, update)
		const decisions = new Map(
			reported.instances.flatMap((instance) =>
				instance.groups.map((group) => [group.id, 'accept'] as const),
			),
		)

		const template = countDocumentQueryReads(next.query)
		let projectCalls: () => CountedQueryCall[] = () => []
		await target.transaction(async function applyCounted(tx) {
			const counted = countDocumentQueryReads(tx)
			projectCalls = counted.calls
			await apply(counted.query, {
				...update,
				sourceQuery: template.query,
				report: reported,
				resolution: { decisions },
			})
		})

		expect(primaryReadsOf({ template: template.calls(), project: projectCalls() })).toEqual(
			testCase.expected,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

/** The reads of the counted calls that resolve primaries, by kind. */
function primaryReadsOf(params: {
	template: readonly CountedQueryCall[]
	project: readonly CountedQueryCall[]
}): PrimaryReads {
	const { template, project } = params
	return {
		templateAncestorsOneByOne: template.filter(
			(call) => call.method === 'findAncestors' && isPrimary(call.args[0]),
		).length,
		templateUuidsOneByOne: template.filter(
			(call) =>
				call.method === 'getAttribute' &&
				isPrimary(call.args[0]) &&
				(call.args[1] as { name?: string } | undefined)?.name === 'uuid',
		).length,
		templateAncestorsBatched: template.filter(
			(call) => call.method === 'findAncestorsOfEach' && holdsPrimaries(call.args[0]),
		).length,
		heldAncestries: project.filter(
			(call) => call.method === 'findAncestorsOfEach' && holdsPrimaries(call.args[0]),
		).length,
		tagReads: project.filter(
			(call) =>
				call.method === 'getRecordsByTagName' && PRIMARY_TAGS.has(String(call.args[0] ?? '')),
		).length,
	}
}

function isPrimary(element: unknown): boolean {
	return PRIMARY_TAGS.has((element as { tagName?: string } | undefined)?.tagName ?? '')
}

function holdsPrimaries(elements: unknown): boolean {
	return Array.isArray(elements) && elements.length > 0 && elements.every(isPrimary)
}

/** The template's voltage level placed twice in the project's substation. */
async function placeTwice(params: {
	sourceQuery: Scl.Query
	target: NonNullable<SclTest.ActParams<ReadsCase>['target']>
}): Promise<void> {
	const placement = await voltageLevelOf({
		sourceQuery: params.sourceQuery,
		scenario: 'instantiate',
	})
	await reportAndApply({ document: params.target, lifecycle: placement })
	await reportAndApply({ document: params.target, lifecycle: placement })
}

/** The template's voltage level, placed or updated in the project's substation. */
async function voltageLevelOf(params: {
	sourceQuery: Scl.Query
	scenario: 'instantiate' | 'template'
}): Promise<LifecycleTarget> {
	const [voltageLevel] = await params.sourceQuery.getRecordsByTagName('VoltageLevel')
	return {
		verb: 'ssd',
		sourceQuery: params.sourceQuery,
		ref: { tagName: 'VoltageLevel', id: voltageLevel.id },
		anchor: projectSubstation,
		scenario: params.scenario,
	}
}
