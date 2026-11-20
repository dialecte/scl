import openIsdXml from '../integration/ied/fixtures/isd-bcu1-version-1.xml?raw'
import droppingPtrc1Xml from '../integration/ied/fixtures/isd-bcu1-version-2-dropping-ptrc1.xml?raw'
import otherVersionXml from '../integration/ied/fixtures/isd-bcu1-version-2.xml?raw'
import projectNorthXml from '../integration/ied/fixtures/project-north-with-bcu1-placed-on-two-bays.xml?raw'
import { listGroups } from '../integration/integration-helpers'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type {
	DecisionGroup,
	DecisionMap,
	DiffReport,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

/** The LN PROT's LPHD1, only in the open ISD. */
const PROT_LPHD_UUID = 'b0000000-0000-4000-8000-000000000028'

type Decide = (groups: readonly DecisionGroup[]) => DecisionMap

type ForkCase = SclTest.BaseXmlTestCase & {
	/** The other version of the open ISD the fork takes. */
	otherXml: string
	/** The decisions, from the report's groups; none: the update is written without a report. */
	decide?: Decide
	targetXml?: string
}

type ReportCase = ForkCase & {
	/** The groups of each instance of the report, `<change> <tag>`, sorted. */
	expectedGroups: string[][]
}

// v2 (the same Header uuid, revision 2) renames CTRL to CTL, adds PTRC2, drops PROT's LPHD1, sets PTOC1's OpDlTmms to
// 200, ACT_T gains phsA, the IP becomes 10.0.1.22 and the bus 100 Mb/s.
describe('query.lifecycle.report - a fork of another version of the open ISD', () => {
	const testCases: SclTest.TestCases<ReportCase> = {
		'v1 open, v2 the other version → the IED updated by uuid, the rename one change; the Communication its own instance':
			{
				sourceXml: openIsdXml,
				otherXml: otherVersionXml,
				expectedGroups: [
					['added LN', 'modified LDevice', 'modified LN', 'modified LN', 'target-only LN'],
					['added BitRate', 'modified P'],
				],
			},
	}

	async function act({ project, testCase }: SclTest.ActParams<ReportCase>): Promise<void> {
		const { open, lifecycle } = await openFork({ project, otherXml: testCase.otherXml })
		const outcome = await open.query.lifecycle.report(lifecycle).then(
			(report) =>
				report.instances.map((instance) => listGroups({ ...report, instances: [instance] })),
			(error: unknown) => toDialecteError(error)?.key,
		)
		expect(outcome).toEqual(testCase.expectedGroups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Accepted, what each group holds is written: the uuids kept, nothing written in the Header or recorded as where the
// IED came from. Skipped, nothing is.
describe('tx.lifecycle.apply - a fork of another version of the open ISD', () => {
	const testCases: SclTest.TestCases<ForkCase> = {
		"every group accepted → the IED, its Communication and its types are v2's, the Header unchanged":
			{
				sourceXml: openIsdXml,
				otherXml: otherVersionXml,
				decide: (groups) => decideAll({ groups, action: () => 'accept' }),
				expectedQueries: [
					'//default:LDevice[@inst="CTL"][@uuid="b0000000-0000-4000-8000-000000000032"]',
					'//default:FCDA[@ldInst="CTL"]',
					'//default:LN[@lnClass="PTRC"][@inst="2"][@uuid="b0000000-0000-4000-8000-000000000026"]',
					'//default:LN[@lnClass="PTOC"]/default:DOI[@name="OpDlTmms"]/default:DAI[@name="setVal"]/default:Val[.="200"]',
					// v2's types, under ids of their own: the specification's LNodes, left out of a fork, still name PTOC_T and PTRC_T
					'//default:LN[@lnClass="PTOC"][@lnType!="PTOC_T"]',
					'//default:DOType[@cdc="ACT"]/default:DA[@name="phsA"]',
					'//default:ConnectedAP[@iedName="BCU1"]/default:Address/default:P[@type="IP"][.="10.0.1.22"]',
					'//default:SubNetwork[@name="StationBus"]/default:BitRate[.="100"]',
					'/default:SCL/default:Header[@revision="1"]',
					'//default:IEDSourceFiles[count(default:SclFileReference) = 2]',
				],
				unexpectedQueries: [
					'//default:LDevice[@inst="CTRL"]',
					`//default:LN[@uuid="${PROT_LPHD_UUID}"]`,
				],
			},
		'only the rename accepted → CTRL renamed CTL, what names it following, the rest as v1': {
			sourceXml: openIsdXml,
			otherXml: otherVersionXml,
			decide: (groups) =>
				decideAll({
					groups,
					action: (group) =>
						group.change === 'modified' && group.primary.tagName === 'LDevice' ? 'accept' : 'skip',
				}),
			expectedQueries: [
				'//default:LDevice[@inst="CTL"]',
				'//default:FCDA[@ldInst="CTL"]',
				'//default:LNode[@ldInst="CTL"][@lnClass="CSWI"]',
				'//default:Val[.="100"]',
				'//default:P[@type="IP"][.="10.0.1.21"]',
				`//default:LN[@uuid="${PROT_LPHD_UUID}"]`,
			],
			unexpectedQueries: ['//default:LN[@lnClass="PTRC"][@inst="2"]', '//default:BitRate'],
		},
		// v2 drops PTRC1 (b…024), the specification's LNode b…014 binding it
		'PTRC1 dropped by v2, its removal accepted → removed, the LNode binding it released': {
			sourceXml: openIsdXml,
			otherXml: droppingPtrc1Xml,
			decide: (groups) => decideAll({ groups, action: () => 'accept' }),
			expectedQueries: [
				'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"][@iedName="None"]',
			],
			unexpectedQueries: [
				'//default:LN[@uuid="b0000000-0000-4000-8000-000000000024"]',
				'//default:LNode[@uuid="b0000000-0000-4000-8000-000000000014"][@lnUuid]',
			],
		},
		// nothing written: no type brought in, nothing added to the Communication
		'every group skipped → the open ISD unchanged': {
			sourceXml: openIsdXml,
			otherXml: otherVersionXml,
			decide: (groups) => decideAll({ groups, action: () => 'skip' }),
			expectedQueries: [
				'//default:LDevice[@inst="CTRL"]',
				'//default:Val[.="100"]',
				'//default:P[@type="IP"][.="10.0.1.21"]',
				`//default:LN[@uuid="${PROT_LPHD_UUID}"]`,
				'/default:SCL/default:DataTypeTemplates[count(default:LNodeType) = 6][count(default:DOType) = 4]',
				'//default:SubNetwork[count(*) = 1]/default:ConnectedAP[count(*) = 1]/default:Address[count(*) = 1]',
			],
			unexpectedQueries: [
				'//default:LN[@lnClass="PTRC"][@inst="2"]',
				'//default:BitRate',
				'//default:DA[@name="phsA"]',
			],
		},
		"only PROT's LPHD1 removal accepted → LPHD1 removed, the rest as v1": {
			sourceXml: openIsdXml,
			otherXml: otherVersionXml,
			decide: (groups) =>
				decideAll({
					groups,
					action: (group) => (group.change === 'target-only' ? 'accept' : 'skip'),
				}),
			expectedQueries: ['//default:LDevice[@inst="CTRL"]', '//default:Val[.="100"]'],
			unexpectedQueries: [`//default:LN[@uuid="${PROT_LPHD_UUID}"]`],
		},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<ForkCase>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, otherXml: testCase.otherXml })
		const refused = await applyFork({ open, lifecycle, decide: testCase.decide }).then(
			() => undefined,
			(error: unknown) => toDialecteError(error)?.key ?? String(error),
		)
		expect(refused).toBeUndefined()
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The update verb takes the fork too: given the report and its decisions, as apply; given none, everything the other
// version brings is written, a removal included.
describe('tx.lifecycle.update.ied - a fork of another version of the open ISD', () => {
	const testCases: SclTest.TestCases<ForkCase> = {
		"no report → everything v2 brings written, the open ISD's own LPHD1 kept": {
			sourceXml: openIsdXml,
			otherXml: otherVersionXml,
			expectedQueries: [
				'//default:LDevice[@inst="CTL"]',
				'//default:LN[@lnClass="PTRC"][@inst="2"]',
				'//default:Val[.="200"]',
				'//default:P[@type="IP"][.="10.0.1.22"]',
				'/default:SCL/default:Header[@revision="1"]',
				// only in the open ISD, with no previous revision to tell it was dropped: the document's own, kept
				`//default:LN[@uuid="${PROT_LPHD_UUID}"]`,
			],
		},
		'the report, only the rename accepted → as apply': {
			sourceXml: openIsdXml,
			otherXml: otherVersionXml,
			decide: (groups) =>
				decideAll({
					groups,
					action: (group) =>
						group.change === 'modified' && group.primary.tagName === 'LDevice' ? 'accept' : 'skip',
				}),
			expectedQueries: ['//default:LDevice[@inst="CTL"]', '//default:Val[.="100"]'],
			unexpectedQueries: ['//default:LN[@lnClass="PTRC"][@inst="2"]'],
		},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<ForkCase>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, otherXml: testCase.otherXml })
		const refused = await updateByFork({ open, lifecycle, decide: testCase.decide }).then(
			() => undefined,
			(error: unknown) => toDialecteError(error)?.key ?? String(error),
		)
		expect(refused).toBeUndefined()
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

// A fork into a project stays a first placement: one finding the IED by its uuid is refused as before.
describe('query.lifecycle.report - a fork of the ISD into a project holding its IED', () => {
	const testCases: SclTest.TestCases<ForkCase & { expectedRefusal: string }> = {
		'the project holding BCU1 (its uuid) → refused OPTION_NOT_AVAILABLE, as a first placement finding the IED':
			{
				sourceXml: otherVersionXml,
				targetXml: projectNorthXml,
				otherXml: otherVersionXml,
				expectedRefusal: 'OPTION_NOT_AVAILABLE',
			},
	}

	async function act({
		project,
		target,
		testCase,
	}: SclTest.ActParams<ForkCase & { expectedRefusal: string }>): Promise<void> {
		if (!target) throw new Error('target required')
		const other = await importIsd({ project, xml: testCase.otherXml, fileName: 'BCU1-r2.isd' })
		const ref = await iedNamed({ query: other.query, name: 'BCU1' })
		const anchor = await rootOf(target.query)
		const refused = await target.query.lifecycle
			.report({
				verb: 'ied',
				scenario: 'fork',
				sourceQuery: other.query,
				ref,
				anchor,
			})
			.then(
				() => 'reported',
				(error: unknown) => toDialecteError(error)?.key,
			)
		expect(refused).toBe(testCase.expectedRefusal)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Project = SclTest.ActParams<ForkCase>['project']
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

/** The update verb run for the fork: with the report and the decisions `decide` gives, or with neither. */
async function updateByFork(params: {
	open: OpenDocument
	lifecycle: ForkLifecycle
	decide?: Decide
}): Promise<void> {
	const { open, lifecycle, decide } = params
	const report: DiffReport | undefined = decide
		? await open.query.lifecycle.report(lifecycle)
		: undefined
	const decisions = report && decide?.(report.instances.flatMap((instance) => instance.groups))
	await open.transaction(async function updateTheIed(tx) {
		await tx.lifecycle.update.ied({
			sourceQuery: lifecycle.sourceQuery,
			iedRef: lifecycle.ref,
			anchor: lifecycle.anchor,
			fileType: 'ISD',
			scenario: 'fork',
			...(report && decisions ? { report, decisions } : {}),
		})
	})
}

/** The open ISD (v1) and the fork of the other version onto it. */
async function openFork(params: { project: Project; otherXml: string }) {
	const { project, otherXml } = params
	const open = await importIsd({ project, xml: openIsdXml, fileName: 'BCU1.isd' })
	const other = await importIsd({ project, xml: otherXml, fileName: 'BCU1-r2.isd' })
	const lifecycle = {
		verb: 'ied',
		scenario: 'fork',
		sourceQuery: other.query,
		ref: await iedNamed({ query: other.query, name: 'BCU1' }),
		anchor: await rootOf(open.query),
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
