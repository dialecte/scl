import openIsdXml from '../integration/ied/fixtures/isd-bcu1-version-1.xml?raw'
import ciloMovedXml from '../integration/ied/fixtures/isd-bcu1-version-2-cilo-moved.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

type MovedCase = SclTest.BaseXmlTestCase & {
	/** The other version of the open ISD. */
	otherXml: string
	/** What the open ISD holds after the update, as `describeAfter` writes it. */
	expected: string[]
}

// An element the other version moves to another parent is moved, keeping its record and its uuid: what names it
// elsewhere in the open ISD still names it, by its uuid and by its new names.
describe('tx.lifecycle.apply - a fork update moving an element another element names', () => {
	const testCases: SclTest.TestCases<MovedCase> = {
		// CILO1 (b…022) sits in CTRL in the open ISD and in PROT in the other version; the BayControl LNode b…012 names it
		'the other version moves CILO1 from CTRL to PROT, every group accepted → CILO1 in PROT, the LNode naming it there':
			{
				// the harness imports the open ISD too; the case opens its own two ISDs under their extension
				sourceXml: openIsdXml,
				otherXml: ciloMovedXml,
				expected: [
					'CILO1 in PROT',
					'LNode b0000000-0000-4000-8000-000000000012 names b0000000-0000-4000-8000-000000000022 as BCU1/PROT/CILO1',
				],
			},
	}

	async function act({ project, testCase }: SclTest.ActParams<MovedCase>): Promise<void> {
		await expect(forkUpdateAccepted({ project, otherXml: testCase.otherXml })).resolves.toEqual(
			testCase.expected,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Project = SclTest.ActParams<MovedCase>['project']

/** The open ISD updated from its other version, every group accepted: where CILO1 is, and how the LNode names it. */
async function forkUpdateAccepted(params: {
	project: Project
	otherXml: string
}): Promise<string[]> {
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
	const report = await open.query.lifecycle.report(lifecycle)
	const groups = report.instances.flatMap((instance) => instance.groups)
	const decisions = new Map(groups.map((group) => [group.id, 'accept'] as const))
	await open.transaction(async function applyEveryGroup(tx) {
		await tx.lifecycle.apply({ ...lifecycle, report, resolution: { decisions } })
	})
	return describeAfter({ query: open.query })
}

/** Where CILO1 sits, and what the BayControl LNode names. */
async function describeAfter(params: { query: Core.Query<Config> }): Promise<string[]> {
	const { query } = params
	const [cilo] = await query.findByAttributes({ tagName: 'LN', attributes: { lnClass: 'CILO' } })
	const device = cilo?.parent ? await query.getRecord(cilo.parent as Scl.Ref<'LDevice'>) : undefined
	const { inst } = device
		? await query.getAttributes(device as Scl.Ref<'LDevice'>)
		: { inst: undefined }
	const [lnode] = await query.findByAttributes({
		tagName: 'LNode',
		attributes: { uuid: 'b0000000-0000-4000-8000-000000000012' },
	})
	const named = lnode ? await query.getAttributes(lnode as Scl.Ref<'LNode'>) : undefined
	return [
		`CILO1 in ${inst ?? 'nothing'}`,
		`LNode ${named?.uuid} names ${named?.lnUuid || 'nothing'} as ${named?.iedName}/${named?.ldInst}/${named?.lnClass}${named?.lnInst}`,
	]
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
