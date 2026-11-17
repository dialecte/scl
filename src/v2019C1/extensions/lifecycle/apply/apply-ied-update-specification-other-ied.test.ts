import isdTemplateWithoutBayControl from '../integration/ied/fixtures/isd-template-of-a-bay-controller-revised-without-bay-control.xml?raw'
import projectNorthRebound from '../integration/ied/fixtures/project-north-with-the-bay-control-interlocking-bound-to-bcu2.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type WaitingCase = SclTest.BaseXmlTestCase & {
	/** The groups waiting for a decision: `<tag> <change> <reason>`, sorted. */
	waiting: string[]
}

type DecidedCase = SclTest.BaseXmlTestCase & {
	/** The decision on the group removing BayControl: none given, accepted or skipped; every other at its suggested action. */
	removal: 'none' | 'accept' | 'skip'
	/** The refusal, when the apply is refused. */
	refusal?: string
}

// A function of the specification the revision drops holding an LNode the project bound to another IED: its removal
// waits for a decision, as a removal of data another element names does. On a level the template's bay was mapped onto,
// it is listed as the project's own (nothing tells it from another file's function). Accepted, the function goes with
// that LNode, the other IED unchanged; skipped, it stays.
describe('query.lifecycle.report - an S-IED update dropping a function bound to another IED', () => {
	const testCases: SclTest.TestCases<WaitingCase> = {
		'the revision dropping BayControl, its interlocking LNode bound to the CILO of BCU2 → the removal of BayControl waits for a decision':
			{
				// BayControl (b…004) holds the LNode b…012 bound by the project to BCU2's CILO (e…022)
				sourceXml: isdTemplateWithoutBayControl,
				targetXml: projectNorthRebound,
				waiting: ['Function target-only unbinds-another-ied'],
			},
	}

	async function act({ project, target, testCase }: SclTest.ActParams<WaitingCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const lifecycle = await updateOfBcu1({ project, target, sourceXml: testCase.sourceXml })
		const report = await target.query.lifecycle.report(lifecycle)
		const waiting = report.instances
			.flatMap((instance) => instance.groups)
			.filter((group) => group.requiresDecision)
			.map((group) => `${group.primary.tagName} ${group.change} ${group.requiresDecision}`)
		expect(waiting.sort()).toEqual(testCase.waiting)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('tx.lifecycle.apply - an S-IED update dropping a function bound to another IED', () => {
	const testCases: SclTest.TestCases<DecidedCase> = {
		'no decision on the removal of BayControl → refused with DECISION_REQUIRED, nothing written': {
			sourceXml: isdTemplateWithoutBayControl,
			targetXml: projectNorthRebound,
			removal: 'none',
			refusal: 'DECISION_REQUIRED',
			expectedQueries: [
				'//default:Function[@name="BayControl"]/default:LNode[@iedName="BCU2"][@lnUuid="e0000000-0000-4000-8000-000000000022"]',
			],
		},
		'the removal of BayControl accepted → BayControl gone with the LNode bound to BCU2, BCU2 unchanged':
			{
				sourceXml: isdTemplateWithoutBayControl,
				targetXml: projectNorthRebound,
				removal: 'accept',
				expectedQueries: [
					'//default:IED[@name="BCU2"]//default:LN[@lnClass="CILO"][@uuid="e0000000-0000-4000-8000-000000000022"]',
				],
				unexpectedQueries: [
					'//default:Function[@name="BayControl"]',
					'//default:LNode[@lnUuid="e0000000-0000-4000-8000-000000000022"]',
				],
			},
		'the removal of BayControl skipped → BayControl and its LNode bound to BCU2 kept': {
			sourceXml: isdTemplateWithoutBayControl,
			targetXml: projectNorthRebound,
			removal: 'skip',
			expectedQueries: [
				'//default:Function[@name="BayControl"]/default:LNode[@iedName="BCU2"][@lnUuid="e0000000-0000-4000-8000-000000000022"]',
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
		const decisions = decide({ report, removal: testCase.removal })
		const refusal = await target
			.transaction(async function applyUpdate(tx) {
				await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
			})
			.then(
				() => undefined,
				(error: unknown) => toDialecteError(error)?.key ?? String(error),
			)
		expect(refusal).toEqual(testCase.refusal)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** Every group at its suggested action, the removal of a function decided as asked (left out of the map for `none`). */
function decide(params: { report: DiffReport; removal: DecidedCase['removal'] }) {
	const groups = params.report.instances.flatMap((instance) => instance.groups)
	return new Map(
		groups.flatMap(function decisionOf(group) {
			// on Q01, a level the template's bay was mapped onto, a function the revision dropped is the project's own
			const isRemoval = group.primary.tagName === 'Function' && group.change === 'target-only'
			if (!isRemoval) return [[group.id, group.suggestedAction] as const]
			if (params.removal === 'none') return []
			return [[group.id, params.removal] as const]
		}),
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
