import openWithProcessBusXml from '../integration/ied/fixtures/isd-bcu1-version-1-with-a-process-bus.xml?raw'
import openWithoutCommunicationXml from '../integration/ied/fixtures/isd-bcu1-version-1-without-communication.xml?raw'
import openIsdXml from '../integration/ied/fixtures/isd-bcu1-version-1.xml?raw'
import connectionOnBusBXml from '../integration/ied/fixtures/isd-bcu1-version-2-connection-on-bus-b.xml?raw'
import otherVersionXml from '../integration/ied/fixtures/isd-bcu1-version-2.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type CommunicationCase = SclTest.BaseXmlTestCase & {
	/** The open ISD. */
	openXml: string
	/** The other version of it the fork takes. */
	otherXml: string
	/** The groups of the report's Communication instance, `<change> <tag> <suggested action>`, sorted. */
	expectedGroups?: string[]
}

// In a fork on an open ISD, the Communication is the file's own: reported as an instance of its own, paired by uuid,
// an element only in the open ISD its own (target-only, kept unless its removal is accepted).
describe('query.lifecycle.report - the Communication in a fork of another version of the open ISD', () => {
	const testCases: SclTest.TestCases<CommunicationCase> = {
		'v2 changing the IP and adding the bit rate → modified P, added BitRate, each accepted by default':
			{
				sourceXml: openIsdXml,
				openXml: openIsdXml,
				otherXml: otherVersionXml,
				expectedGroups: ['added BitRate accept', 'modified P accept'],
			},
		'a subnetwork only in the open ISD (ProcessBus) → target-only, kept by default': {
			sourceXml: openIsdXml,
			openXml: openWithProcessBusXml,
			otherXml: otherVersionXml,
			expectedGroups: ['added BitRate accept', 'modified P accept', 'target-only SubNetwork skip'],
		},
	}

	async function act({ project, testCase }: SclTest.ActParams<CommunicationCase>): Promise<void> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const outcome = await open.query.lifecycle.report(lifecycle).then(
			(report) =>
				report.instances
					.filter((instance) => instance.rootRef?.tagName === 'Communication')
					.flatMap((instance) => instance.groups)
					.map((group) => `${group.change} ${group.primary.tagName} ${group.suggestedAction}`)
					.sort(),
			(error: unknown) => toDialecteError(error)?.key,
		)
		expect(outcome).toEqual(testCase.expectedGroups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// An open ISD without a Communication takes the other version's through the placement of the IED's connections.
describe('tx.lifecycle.apply - a fork onto an open ISD without a Communication', () => {
	const testCases: SclTest.TestCases<CommunicationCase> = {
		'every group accepted → the connection of v2 added, its IP and its subnetwork': {
			sourceXml: openIsdXml,
			openXml: openWithoutCommunicationXml,
			otherXml: otherVersionXml,
			expectedQueries: [
				'//default:SubNetwork[@name="StationBus"]/default:ConnectedAP[@iedName="BCU1"][@apName="AP1"]/default:Address/default:P[@type="IP"][.="10.0.1.22"]',
			],
		},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<CommunicationCase>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const refused = await applyEveryGroup({ open, lifecycle }).then(
			() => undefined,
			(error: unknown) => toDialecteError(error)?.key ?? String(error),
		)
		expect(refused).toBeUndefined()
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The other version moves the IED's only connection from StationBus to Bus_B: applied in `prepare`, the commit's prune
// lists the subnetwork it leaves holding nothing, and the commit removes it.
describe('tx.cleanUp.commitPrune - after a fork moving the connection to another subnetwork', () => {
	const testCases: SclTest.TestCases<CommunicationCase & { expectedListed: string[] }> = {
		'the connection moved from StationBus to Bus_B, every group accepted → StationBus emptied: listed, then gone':
			{
				sourceXml: openIsdXml,
				openXml: openIsdXml,
				otherXml: connectionOnBusBXml,
				expectedListed: ['SubNetwork StationBus'],
				expectedQueries: [
					'//default:SubNetwork[@name="Bus_B"]/default:ConnectedAP[@iedName="BCU1"][@apName="AP1"]',
				],
				unexpectedQueries: [
					'//default:SubNetwork[@name="StationBus"]',
					'(//default:ConnectedAP)[2]',
				],
			},
	}

	async function act({
		project,
		testCase,
	}: SclTest.ActParams<
		CommunicationCase & { expectedListed: string[] }
	>): Promise<SclTest.ActResult> {
		const { open, lifecycle } = await openFork({ project, ...testCase })
		const listed = await applyThenPrune({ open, lifecycle }).catch((error: unknown) => [
			toDialecteError(error)?.key ?? String(error),
		])
		expect(listed).toEqual(testCase.expectedListed)
		return { assertOn: 'custom', xmlString: await open.query.getSnapshot({ as: 'xml' }) }
	}

	runSclTestCases.withExport({ testCases, act })
})

type Project = SclTest.ActParams<CommunicationCase>['project']
type OpenDocument = Awaited<ReturnType<typeof importIsd>>
type ForkLifecycle = Awaited<ReturnType<typeof openFork>>['lifecycle']

/** The fork reported and applied on the open ISD, every group accepted. */
async function applyEveryGroup(params: {
	open: OpenDocument
	lifecycle: ForkLifecycle
}): Promise<void> {
	const { open, lifecycle } = params
	const report = await open.query.lifecycle.report(lifecycle)
	const groups = report.instances.flatMap((instance) => instance.groups)
	const decisions = new Map(groups.map((group) => [group.id, 'accept'] as const))
	await open.transaction(async function applyAccepted(tx) {
		await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
	})
}

/** The fork applied in `prepare`, every group accepted, then the commit's prune previewed and committed. */
async function applyThenPrune(params: {
	open: OpenDocument
	lifecycle: ForkLifecycle
}): Promise<string[]> {
	const { open, lifecycle } = params
	const report = await open.query.lifecycle.report(lifecycle)
	const groups = report.instances.flatMap((instance) => instance.groups)
	const decisions = new Map(groups.map((group) => [group.id, 'accept'] as const))
	let listed: string[] = []
	const prepared = await open.prepare(async function applyThenPreview(tx) {
		await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
		const preview = await tx.cleanUp.commitPrune()
		const records = await tx.getRecords(
			preview.containers.map((container) => container.element) as Scl.Ref<Scl.ElementsOf>[],
		)
		listed = records.flatMap((record) =>
			record
				? [`${record.tagName} ${record.attributes.find((a) => a.name === 'name')?.value ?? ''}`]
				: [],
		)
	})
	await prepared.commit()
	return listed.sort()
}

/** The open ISD and the fork of its other version onto it. */
async function openFork(params: { project: Project; openXml: string; otherXml: string }) {
	const { project, openXml, otherXml } = params
	const open = await importIsd({ project, xml: openXml, fileName: 'BCU1.isd' })
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
