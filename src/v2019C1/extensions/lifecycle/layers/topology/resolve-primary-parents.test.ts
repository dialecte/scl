import feedersRevision1 from '../../integration/moved/fixtures/feeders-revision-1.xml?raw'
import feedersMovingCtrl from '../../integration/moved/fixtures/feeders-revision-2-moving-ctrl-to-feeder2.xml?raw'
import levelRevision1 from '../../integration/moved/fixtures/level-template-revision-1.xml?raw'
import levelMovingBayControl from '../../integration/moved/fixtures/level-template-revision-2-moving-baycontrol-to-q02.xml?raw'
import twoApplicationsRevision1 from '../../integration/moved/fixtures/level-template-with-two-applications-revision-1.xml?raw'
import twoApplicationsMovingBayControl from '../../integration/moved/fixtures/level-template-with-two-applications-revision-2-moving-baycontrol-to-q02.xml?raw'
import { resolveInstanceLevels, resolveTemplateFrame } from './resolve-instance-levels'
import { readTemplatePrimaries, resolvePrimaryParentsOfEach } from './resolve-primary-parents'

import { describe, expect } from 'vitest'

import { reportAndApply } from '@/v2019C1/extensions/lifecycle/integration/integration-helpers'
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

/** The tags of the primaries a pass resolves. */
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

/** The project reads one pass makes, by kind. */
type PassReads = {
	/** The records of a primary tag read. */
	tagReads: number
	/** The ancestors of held primaries read in one call. */
	heldAncestries: number
}

type ReadsCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** The revised template the pass resolves the primaries of. */
	nextXml: string
	withMoves: boolean
	expected: PassReads
}

// The template placed twice, then one pass over every primary of its revision, both instances at once: one read per
// primary tag present and, with moves, one ancestry read for every held primary, whatever the number of primaries.
describe('resolvePrimaryParentsOfEach - the project reads of one pass', () => {
	const testCases: SclTest.TestCases<ReadsCase> = {
		'two functions, with moves → one Function read, one ancestry read': {
			sourceXml: feedersRevision1,
			targetXml: projectXml,
			nextXml: feedersMovingCtrl,
			withMoves: true,
			expected: { tagReads: 1, heldAncestries: 1 },
		},
		'an application and a function, with moves → one read per tag, one ancestry read': {
			sourceXml: levelRevision1,
			targetXml: projectXml,
			nextXml: levelMovingBayControl,
			withMoves: true,
			expected: { tagReads: 2, heldAncestries: 1 },
		},
		'two applications and a function, with moves → the Application tag read once, not once per application':
			{
				sourceXml: twoApplicationsRevision1,
				targetXml: projectXml,
				nextXml: twoApplicationsMovingBayControl,
				withMoves: true,
				expected: { tagReads: 2, heldAncestries: 1 },
			},
		'two applications and a function, without moves → one read per tag, no ancestry read': {
			sourceXml: twoApplicationsRevision1,
			targetXml: projectXml,
			nextXml: twoApplicationsMovingBayControl,
			withMoves: false,
			expected: { tagReads: 2, heldAncestries: 0 },
		},
	}

	async function act({ testCase, project, source, target }: SclTest.ActParams<ReadsCase>) {
		if (!target) throw new Error('target required')
		const placement = await voltageLevelOf({ sourceQuery: source.query })
		await reportAndApply({ document: target, lifecycle: placement })
		await reportAndApply({ document: target, lifecycle: placement })
		const next = await openSclDocument({ project, xml: testCase.nextXml, label: 'revision 2' })
		const unit = await voltageLevelOf({ sourceQuery: next.query })
		const templateApplications = await next.query.getRecordsByTagName('Application')
		const templateFunctions = await next.query.getRecordsByTagName('Function')
		const primaries = await readTemplatePrimaries(next.query, {
			refs: [...templateApplications, ...templateFunctions].map(toPrimaryRef),
		})
		const instanceLevelsList = await levelsOfEachInstance({
			target,
			sourceQuery: next.query,
			unitRef: unit.ref,
		})

		const counted = countDocumentQueryReads(target.query)
		await resolvePrimaryParentsOfEach(counted.query, {
			anchor: projectSubstation,
			unitId: unit.ref.id ?? '',
			matchKey: 'templateUuid',
			primaries,
			instanceLevelsList,
			withMoves: testCase.withMoves,
		})

		expect(instanceLevelsList).toHaveLength(2)
		expect(primaries.length).toBeGreaterThanOrEqual(2)
		expect(passReadsOf(counted.calls())).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

function passReadsOf(calls: readonly CountedQueryCall[]): PassReads {
	return {
		tagReads: calls.filter(
			(call) =>
				call.method === 'getRecordsByTagName' && PRIMARY_TAGS.has(String(call.args[0] ?? '')),
		).length,
		heldAncestries: calls.filter((call) => call.method === 'findAncestorsOfEach').length,
	}
}

function toPrimaryRef(record: { tagName: string; id: string }) {
	return { tagName: record.tagName, id: record.id } as Scl.Ref<'Application'> | Scl.Ref<'Function'>
}

/** Where each instance of the template's unit stands in the project, level by level. */
async function levelsOfEachInstance(params: {
	target: NonNullable<SclTest.ActParams<ReadsCase>['target']>
	sourceQuery: Scl.Query
	unitRef: Scl.Ref<Scl.ElementsOf>
}) {
	const { target, sourceQuery, unitRef } = params
	const templateFrame = await resolveTemplateFrame(sourceQuery, unitRef)
	const instances = await target.query.getRecordsByTagName('VoltageLevel')
	const placements = await Promise.all(
		instances.map((instance) =>
			resolveInstanceLevels(target.query, {
				sourceQuery,
				templateFrame,
				frameInstance: { tagName: 'VoltageLevel', id: instance.id },
			}),
		),
	)
	return placements.map((placement) => placement.levels)
}

/** The template's voltage level, placed in the project's substation. */
async function voltageLevelOf(params: { sourceQuery: Scl.Query }): Promise<LifecycleTarget> {
	const [voltageLevel] = await params.sourceQuery.getRecordsByTagName('VoltageLevel')
	return {
		verb: 'ssd',
		sourceQuery: params.sourceQuery,
		ref: { tagName: 'VoltageLevel', id: voltageLevel.id },
		anchor: projectSubstation,
		scenario: 'instantiate',
	}
}
