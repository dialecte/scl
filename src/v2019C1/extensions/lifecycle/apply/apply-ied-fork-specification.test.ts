import openSpecificationXml from '../integration/ied/fixtures/isd-bcu1-specification-version-1.xml?raw'
import otherSpecificationXml from '../integration/ied/fixtures/isd-bcu1-specification-version-2.xml?raw'
import openIsdXml from '../integration/ied/fixtures/isd-bcu1-version-1.xml?raw'
import otherVersionXml from '../integration/ied/fixtures/isd-bcu1-version-2.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** Metering, the function revision 2 adds; Supervision, the application it drops. */
const METERING_UUID = 'b0000000-0000-4000-8000-000000000043'
const SUPERVISION_UUID = 'b0000000-0000-4000-8000-000000000040'

type Decide = (groups: readonly DecisionGroup[]) => DecisionMap

type SpecificationCase = SclTest.BaseXmlTestCase & {
	/** The open ISD, and the other version of it the fork takes. */
	openXml: string
	otherXml: string
	decide?: Decide
	/** The groups of the specification's instances (neither the IED's nor the Communication's), `<change> <tag>`, sorted. */
	expectedGroups?: string[]
}

// Revision 2 drops the application Supervision, renames LineProtection's SubFunction Trip to Tripping, adds Metering
// with its LNode specified on BCU1, and specifies the PTRC LNode b…014 as PTRC2, which the IED gains. Its binding (to
// PTRC1) is a reference, kept coherent by the hooks and never compared as content: it stays.
describe('query.lifecycle.report - the specification in a fork of another version of the open ISD', () => {
	const testCases: SclTest.TestCases<SpecificationCase> = {
		'revision 2 changing the specification → each change by uuid, Supervision only in the open ISD':
			{
				sourceXml: openIsdXml,
				openXml: openSpecificationXml,
				otherXml: otherSpecificationXml,
				expectedGroups: [
					'added Function',
					'modified LNodeSpecNaming',
					'modified SubFunction',
					'target-only Application',
				],
			},
	}

	async function act({ project, testCase }: SclTest.ActParams<SpecificationCase>): Promise<void> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const outcome = await open.query.lifecycle.report(lifecycle).then(
			(report) =>
				report.instances
					.filter((instance) => !['IED', 'Communication'].includes(instance.rootRef?.tagName ?? ''))
					.flatMap((instance) => instance.groups)
					.map((group) => `${group.change} ${group.primary.tagName}`)
					.sort(),
			(error: unknown) => toDialecteError(error)?.key,
		)
		expect(outcome).toEqual(testCase.expectedGroups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, what each group of the specification holds is written, paired by uuid; skipped, nothing is.
describe('tx.lifecycle.apply - the specification in a fork of another version of the open ISD', () => {
	const testCases: SclTest.TestCases<SpecificationCase> = {
		"every group accepted → the process part is revision 2's": {
			sourceXml: openIsdXml,
			openXml: openSpecificationXml,
			otherXml: otherSpecificationXml,
			decide: (groups) => decideAll({ groups, action: () => 'accept' }),
			expectedQueries: [
				`//default:Bay[@name="Q01"]/default:Function[@uuid="${METERING_UUID}"]/default:LNode[@lnClass="MMXU"]`,
				'//default:SubFunction[@uuid="b0000000-0000-4000-8000-000000000042"][@name="Tripping"]',
				'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"][@lnUuid="b0000000-0000-4000-8000-000000000024"]//v2019C1:LNodeSpecNaming[@sLnInst="2"]',
			],
			unexpectedQueries: [
				`//*[@uuid="${SUPERVISION_UUID}"]`,
				'//default:SubFunction[@name="Trip"]',
			],
		},
		'only Metering accepted → Metering added, the rest as revision 1': {
			sourceXml: openIsdXml,
			openXml: openSpecificationXml,
			otherXml: otherSpecificationXml,
			decide: (groups) =>
				decideAll({
					groups,
					action: (group) =>
						group.change === 'added' && group.primary.tagName === 'Function' ? 'accept' : 'skip',
				}),
			expectedQueries: [
				`//default:Function[@uuid="${METERING_UUID}"]`,
				`//*[@uuid="${SUPERVISION_UUID}"]`,
				'//default:SubFunction[@name="Trip"]',
				'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"]//v2019C1:LNodeSpecNaming[@sLnInst="1"]',
			],
		},
		'every group skipped → the specification as revision 1': {
			sourceXml: openIsdXml,
			openXml: openSpecificationXml,
			otherXml: otherSpecificationXml,
			decide: (groups) => decideAll({ groups, action: () => 'skip' }),
			expectedQueries: [`//*[@uuid="${SUPERVISION_UUID}"]`, '//default:SubFunction[@name="Trip"]'],
			unexpectedQueries: [`//default:Function[@uuid="${METERING_UUID}"]`],
		},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<SpecificationCase>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const refused = await applyFork({ open, lifecycle, decide: testCase.decide }).then(
			() => undefined,
			(error: unknown) => toDialecteError(error)?.key ?? String(error),
		)
		expect(refused).toBeUndefined()
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The types the IED and the specification's LNodes share follow the other version where they are: no copy of one
// under an id of its own beside it.
describe('tx.lifecycle.apply - the types in a fork of another version of the open ISD', () => {
	const testCases: SclTest.TestCases<SpecificationCase> = {
		'every group accepted, ACT_T gaining phsA → ACT_T updated in place, PTOC_T and PTRC_T kept, no copy':
			{
				sourceXml: openIsdXml,
				openXml: openIsdXml,
				otherXml: otherVersionXml,
				decide: (groups) => decideAll({ groups, action: () => 'accept' }),
				expectedQueries: [
					'//default:DOType[@id="ACT_T"]/default:DA[@name="phsA"]',
					'//default:LN[@lnClass="PTOC"][@lnType="PTOC_T"]',
					'//default:LN[@lnClass="PTRC"][@inst="1"][@lnType="PTRC_T"]',
					'//default:LNode[@lnClass="PTOC"][@lnType="PTOC_T"]',
					'/default:SCL/default:DataTypeTemplates[count(default:LNodeType) = 6][count(default:DOType) = 4]',
				],
			},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<SpecificationCase>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const refused = await applyFork({ open, lifecycle, decide: testCase.decide }).then(
			() => undefined,
			(error: unknown) => toDialecteError(error)?.key ?? String(error),
		)
		expect(refused).toBeUndefined()
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

type Project = SclTest.ActParams<SpecificationCase>['project']
type OpenDocument = Awaited<ReturnType<typeof importIsd>>
type ForkLifecycle = Awaited<ReturnType<typeof openFork>>['lifecycle']

/** Every group decided by `action`. */
function decideAll(params: {
	groups: readonly DecisionGroup[]
	action: (group: DecisionGroup) => 'accept' | 'skip'
}): DecisionMap {
	return new Map(params.groups.map((group) => [group.id, params.action(group)] as const))
}

/** The fork reported and applied on the open ISD, its groups decided by `decide` (none: every group skipped). */
async function applyFork(params: {
	open: OpenDocument
	lifecycle: ForkLifecycle
	decide?: Decide
}): Promise<void> {
	const { open, lifecycle, decide } = params
	const report = await open.query.lifecycle.report(lifecycle)
	const decisions = decide?.(report.instances.flatMap((instance) => instance.groups)) ?? new Map()
	await open.transaction(async function applyEachDecision(tx) {
		await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
	})
}

/** The open ISD and the fork of its other version onto it. */
async function openFork(params: { project: Project; openXml: string; otherXml: string }) {
	const { project, openXml, otherXml } = params
	const open = await importIsd({ project, xml: openXml, fileName: 'BCU1.isd' })
	const other = await importIsd({ project, xml: otherXml, fileName: 'BCU1-r2.isd' })
	const ref = await iedNamed({ query: other.query, name: 'BCU1' })
	const anchor = await rootOf(open.query)
	const lifecycle = {
		verb: 'ied',
		scenario: 'fork',
		sourceQuery: other.query,
		ref,
		anchor,
	} as const
	return { open, lifecycle }
}

/** Import an ISD of the case into the project, under its own extension, and open it. */
async function importIsd(params: { project: Project; xml: string; fileName: string }) {
	const { project, xml, fileName } = params
	const { documentId } = await project.importFile(new File([xml], fileName, { type: 'text/xml' }))
	return project.openDocument(documentId)
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

/** The root of a document. */
async function rootOf(query: Core.Query<Config>): Promise<Scl.Ref<'SCL'>> {
	const root = await query.getRoot()
	return { tagName: 'SCL', id: root.id }
}
