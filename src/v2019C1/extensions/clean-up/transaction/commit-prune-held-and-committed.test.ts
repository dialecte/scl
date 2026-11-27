import serverWithOneLogicalDeviceXml from '../../../hooks/before-commit/fixtures/commit-plan-a-server-with-one-logical-device.xml?raw'
import twoGooseDataSetsXml from '../../../hooks/before-commit/fixtures/commit-plan-two-goose-data-sets-of-one-entry.xml?raw'
import twoSubNetworksXml from '../../../hooks/before-commit/fixtures/commit-plan-two-subnetworks-one-with-one-access-point.xml?raw'
import labelledBayWithToolDataXml from './fixtures/commit-prune-a-labelled-bay-with-tool-data.xml?raw'
import logicalNodeWithOwnTypeXml from './fixtures/commit-prune-a-logical-node-with-its-own-type.xml?raw'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CommitPrune } from './commit-prune.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

// The preview names the staged state it read: a write staged after it is not in it.
describe('tx.cleanUp.commitPrune - valid only for the staged state it read', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// DS1 and DS2 each hold one entry: DS2's entry deleted after the preview
		"the only entry of DS1 deleted, previewed, then DS2's → the preview names the staged count it read and DS1 only":
			{
				sourceXml: twoGooseDataSetsXml,
			},
	}

	async function act({ source }: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		await expect(staleness({ source })).resolves.toEqual({
			readAtPreview: true,
			readFewerThanStaged: true,
			containers: ['ds1'],
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// What the preview lists is what the commit removes; discarded, the document is unchanged.
describe('tx.cleanUp.commitPrune - committed, the document holds what it listed', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// GC1 sends DS1 and nothing else: committed, DS1 is gone and GC1 names no data set
		'the only entry of DS1 deleted, previewed, committed → DS1 gone, GC1 without its data set and revised':
			{
				sourceXml: twoGooseDataSetsXml,
				expectedQueries: ['//default:GSEControl[@name="GC1"][not(@datSet)][@confRev="10001"]'],
				unexpectedQueries: ['//default:DataSet[@name="DS1"]'],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await expect(previewThenCommit({ source })).resolves.toEqual(['ds1'])
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('tx.cleanUp.commitPrune - discarded, the document is unchanged', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// the same DS1, previewed then discarded
		'the only entry of DS1 deleted, previewed, discarded → DS1 and GC1 as they were': {
			sourceXml: twoGooseDataSetsXml,
			expectedQueries: [
				'//default:DataSet[@name="DS1"]/default:FCDA',
				'//default:GSEControl[@name="GC1"][@datSet="DS1"][@confRev="1"]',
			],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await expect(previewThenDiscard({ source })).resolves.toEqual(['ds1'])
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// Every record a container holds keeps what a tool reads from it: its attributes and its parent, a lock included.
describe('tx.cleanUp.commitPrune - the records a container holds keep their attributes and parents', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// the tool's Private holds an entry, its locked address two levels down and a text property without a lock
		'the last Label of B1 deleted → the tool data held, each record with its parent and attributes':
			{
				sourceXml: labelledBayWithToolDataXml,
			},
	}

	async function act({ source }: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		await expect(heldRecords({ source })).resolves.toEqual([
			'Private b1-tool-data under Labels b1-labels: type=acme-labels',
			'LabelInfo b1-label-info under Private b1-tool-data: name=L1 labelId=7',
			'Address b1-address under LabelInfo b1-label-info: casdu=1 ioa=2 ti=3 locked=true',
			'TextProperty b1-text under LabelInfo b1-label-info: name=unit value=A',
		])
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The only IED deleted leaves every type unused and the DataTypeTemplates empty: each type is listed once, under
// `types`, and the DataTypeTemplates holds none of them.
describe('tx.cleanUp.commitPrune - an emptied DataTypeTemplates and its types, each listed once', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// IED1 is the only IED: its deletion leaves LLN0_T, XCBR_T, ENS_T, DPC_T and Beh_E unused
		'the only IED deleted → the DataTypeTemplates holding nothing, the five types listed once': {
			sourceXml: logicalNodeWithOwnTypeXml,
		},
	}

	async function act({ source }: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		await expect(templatesAndTypes({ source })).resolves.toEqual({
			templates: 'DataTypeTemplates templates: emptied holds-nothing; holds nothing',
			types: ['beh-enum', 'dpc-type', 'ens-type', 'lln0-type', 'xcbr-type'],
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type ParityCase = SclTest.BaseXmlTestCase & {
	write: (tx: Scl.Transaction) => Promise<void>
	/** The ids of the containers the preview lists. */
	listed: string[]
}

// Committed, each container the preview listed is gone, with what it held.
describe('tx.cleanUp.commitPrune - committed, each container listed is gone', () => {
	const testCases: SclTest.TestCases<ParityCase> = {
		// B1's Labels holds a Label and the tool data
		'the last Label of B1 deleted, previewed, committed → the Labels and the tool data gone': {
			sourceXml: labelledBayWithToolDataXml,
			write: deleting([{ tagName: 'Label', id: 'b1-label-en' }]),
			listed: ['b1-labels'],
			expectedQueries: ['//default:Bay[@name="B1"]'],
			unexpectedQueries: ['//default:Labels', '//default:Private[@type="acme-labels"]'],
		},
		// Bus_A connects IED1 only
		'the only connected access point of Bus_A moved, previewed, committed → Bus_A gone': {
			sourceXml: twoSubNetworksXml,
			write: async function moveIed1ToBusB(tx) {
				await tx.move(
					{ tagName: 'ConnectedAP', id: 'bus-a-ied1' },
					{ parent: { tagName: 'SubNetwork', id: 'bus-b' } },
				)
			},
			listed: ['bus-a'],
			expectedQueries: ['//default:SubNetwork[@name="Bus_B"]/default:ConnectedAP[@iedName="IED1"]'],
			unexpectedQueries: ['//default:SubNetwork[@name="Bus_A"]'],
		},
		// IED1's server holds its Authentication and one logical device
		'the last logical device of IED1 deleted, previewed, committed → its Server gone, its access point kept':
			{
				sourceXml: serverWithOneLogicalDeviceXml,
				write: deleting([{ tagName: 'LDevice', id: 'ied1-ld' }]),
				listed: ['ied1-server'],
				expectedQueries: ['//default:IED[@name="IED1"]/default:AccessPoint[@name="AP1"]'],
				unexpectedQueries: ['//default:IED[@name="IED1"]//default:Server'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<ParityCase>): Promise<SclTest.ActResult> {
		await expect(listedThenCommitted({ source, write: testCase.write })).resolves.toEqual(
			testCase.listed,
		)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/** The records B1's Labels holds once its last Label is deleted: `<tag> <id> under <parent>: <attributes>`. */
async function heldRecords(params: { source: Source }): Promise<string[]> {
	const preview = await previewed({
		source: params.source,
		write: deleting([{ tagName: 'Label', id: 'b1-label-en' }]),
	})
	const [labels] = preview.containers
	if (!labels) return []
	return labels.holds.map(function describeHeld(record) {
		const attributes = record.attributes
			.map((attribute) => `${attribute.name}=${attribute.value}`)
			.join(' ')
		return `${record.tagName} ${record.id} under ${record.parent?.tagName} ${record.parent?.id}: ${attributes}`
	})
}

/** The DataTypeTemplates and the types the preview lists once the only IED is deleted. */
async function templatesAndTypes(params: {
	source: Source
}): Promise<{ templates: string; types: string[] }> {
	const preview = await previewed({
		source: params.source,
		write: deleting([{ tagName: 'IED', id: 'ied1' }]),
	})
	const templates = preview.containers.find(
		(container) => container.element.tagName === 'DataTypeTemplates',
	)
	const held =
		templates?.holds.map((record) => `${record.tagName} ${record.id}`).join(', ') || 'nothing'
	const why =
		templates?.reason.kind === 'emptied' ? `emptied ${templates.reason.rule}` : 'not emptied'
	return {
		templates: templates
			? `DataTypeTemplates ${templates.element.id}: ${why}; holds ${held}`
			: 'none',
		types: preview.types.map((type) => type.element.id).sort(),
	}
}

/** The ids of the containers the preview lists after `write`, then committed. */
async function listedThenCommitted(params: {
	source: Source
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<string[]> {
	let listed: string[] = []
	const prepared = await params.source.prepare(async function writeThenPreview(tx) {
		await params.write(tx)
		const preview = await tx.cleanUp.commitPrune()
		listed = preview.containers.map((container) => container.element.id)
	})
	await prepared.commit()
	return listed
}

/** DS1's entry deleted and previewed, then DS2's deleted: what the preview read against what was staged. */
async function staleness(params: {
	source: Source
}): Promise<{ readAtPreview: boolean; readFewerThanStaged: boolean; containers: string[] }> {
	let preview: CommitPrune | undefined
	let atPreview = 0
	let staged = 0
	const prepared = await params.source.prepare(async function previewThenWriteMore(tx) {
		await tx.delete({ tagName: 'FCDA', id: 'ds1-entry' })
		atPreview = tx.getStagedOperations().length
		preview = await tx.cleanUp.commitPrune()
		await tx.delete({ tagName: 'FCDA', id: 'ds2-entry' })
		staged = tx.getStagedOperations().length
	})
	prepared.discard()
	if (!preview) throw new Error('no preview')
	return {
		readAtPreview: preview.stagedCount === atPreview,
		readFewerThanStaged: preview.stagedCount < staged,
		containers: preview.containers.map((container) => container.element.id),
	}
}

/** DS1's entry deleted and previewed, then committed: the containers the preview listed. */
async function previewThenCommit(params: { source: Source }): Promise<string[]> {
	let listed: string[] = []
	const prepared = await params.source.prepare(async function deleteThenPreview(tx) {
		await tx.delete({ tagName: 'FCDA', id: 'ds1-entry' })
		const preview = await tx.cleanUp.commitPrune()
		listed = preview.containers.map((container) => container.element.id)
	})
	await prepared.commit()
	return listed
}

/** DS1's entry deleted and previewed, then discarded: the containers the preview listed. */
async function previewThenDiscard(params: { source: Source }): Promise<string[]> {
	let listed: string[] = []
	const prepared = await params.source.prepare(async function deleteThenPreview(tx) {
		await tx.delete({ tagName: 'FCDA', id: 'ds1-entry' })
		const preview = await tx.cleanUp.commitPrune()
		listed = preview.containers.map((container) => container.element.id)
	})
	prepared.discard()
	return listed
}

/** The preview after `write`, the transaction discarded. */
async function previewed(params: {
	source: Source
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<CommitPrune> {
	const { source, write } = params
	let preview: CommitPrune | undefined
	const prepared = await source.prepare(async function writeThenPreview(tx) {
		await write(tx)
		preview = await tx.cleanUp.commitPrune()
	})
	prepared.discard()
	if (!preview) throw new Error('no preview')
	return preview
}

/** A write deleting each element, in order. */
function deleting(
	refs: readonly Scl.Ref<Scl.ElementsOf>[],
): (tx: Scl.Transaction) => Promise<void> {
	return async function deleteEach(tx) {
		for (const ref of refs) await tx.delete(ref)
	}
}
