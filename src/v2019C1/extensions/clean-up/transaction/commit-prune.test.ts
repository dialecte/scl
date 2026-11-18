import anIedAndABayXml from '../../../hooks/before-commit/fixtures/an-ied-with-two-logical-devices-and-a-bay.xml?raw'
import serverWithOneLogicalDeviceXml from '../../../hooks/before-commit/fixtures/commit-plan-a-server-with-one-logical-device.xml?raw'
import twoGooseDataSetsXml from '../../../hooks/before-commit/fixtures/commit-plan-two-goose-data-sets-of-one-entry.xml?raw'
import twoSubNetworksXml from '../../../hooks/before-commit/fixtures/commit-plan-two-subnetworks-one-with-one-access-point.xml?raw'
import labelledBayWithToolDataXml from './fixtures/commit-prune-a-labelled-bay-with-tool-data.xml?raw'
import logicalNodeWithOwnTypeXml from './fixtures/commit-prune-a-logical-node-with-its-own-type.xml?raw'
import labelsAndLoneSubNetworkXml from './fixtures/commit-prune-labels-and-a-lone-subnetwork.xml?raw'
import threeSubNetworksXml from './fixtures/commit-prune-three-subnetworks.xml?raw'
import twoLanguagesXml from './fixtures/commit-prune-two-objects-labelled-in-two-languages.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { CommitPrune, CommitPrunedContainer } from './commit-prune.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type PreviewCase = SclTest.BaseXmlTestCase & {
	/** What the transaction writes before the preview. */
	write: (tx: Scl.Transaction) => Promise<void>
	/** Each container the preview lists, as `describeContainer` writes it, in its order. */
	containers: string[]
	/** Each type the preview lists, as `describeType` writes it. */
	types?: string[]
}

// The preview lists, without writing, every container the commit will prune: its identity, its parent, the element it
// belongs to with that element's path, why it goes, every record it holds and what goes with it outside.
describe('tx.cleanUp.commitPrune - what the commit will prune, before it does', () => {
	const testCases: SclTest.TestCases<PreviewCase> = {
		// B1's Labels holds a Label and a tool's Private: an entry, its locked address and its unlocked text property
		'the last Label of a Labels holding tool data deleted → the Labels of B1, holding every record of the tool data':
			{
				sourceXml: labelledBayWithToolDataXml,
				write: deleting([{ tagName: 'Label', id: 'b1-label-en' }]),
				containers: [
					'Labels b1-labels [] in Bay b1 B1, owned by Bay S1/V1/B1: emptied lost-required Label; holds Private b1-tool-data, LabelInfo b1-label-info, Address b1-address, TextProperty b1-text; goes with nothing',
				],
			},
		// B1 and B2 are labelled in French only, B3 in English and French: the French labels deleted from B2 first
		'one language removed from three labelled bays → the Labels of B1 and B2, in document order': {
			sourceXml: twoLanguagesXml,
			write: deleting([
				{ tagName: 'Label', id: 'b3-fr' },
				{ tagName: 'Label', id: 'b2-fr' },
				{ tagName: 'Label', id: 'b1-fr' },
			]),
			containers: [
				'Labels b1-labels [] in Bay b1 B1, owned by Bay S1/V1/B1: emptied holds-nothing; holds nothing; goes with nothing',
				'Labels b2-labels [] in Bay b2 B2, owned by Bay S1/V1/B2: emptied holds-nothing; holds nothing; goes with nothing',
			],
		},
		// Bus_A connects IED1 only
		'the only connected access point of Bus_A moved to Bus_B → Bus_A, named with its type': {
			sourceXml: twoSubNetworksXml,
			write: async function moveIed1ToBusB(tx) {
				await tx.move(
					{ tagName: 'ConnectedAP', id: 'bus-a-ied1' },
					{ parent: { tagName: 'SubNetwork', id: 'bus-b' } },
				)
			},
			containers: [
				'SubNetwork bus-a [name=Bus_A type=8-MMS uuid] in Communication communication, owned by nothing: emptied holds-nothing; holds nothing; goes with nothing',
			],
		},
		// Bus_A connects IED1 only: unassigning it empties Bus_A as the move does
		'the only connected access point of Bus_A deleted → the same Bus_A': {
			sourceXml: twoSubNetworksXml,
			write: deleting([{ tagName: 'ConnectedAP', id: 'bus-a-ied1' }]),
			containers: [
				'SubNetwork bus-a [name=Bus_A type=8-MMS uuid] in Communication communication, owned by nothing: emptied holds-nothing; holds nothing; goes with nothing',
			],
		},
		// Bus_A connects IED1, Bus_B IED2 and IED3, Bus_C IED4: IED1 and IED2 moved to Bus_C
		'two connected access points moved in one transaction, one leaving Bus_A → only Bus_A, from one call':
			{
				sourceXml: threeSubNetworksXml,
				write: async function moveIed1AndIed2ToBusC(tx) {
					await tx.move(
						{ tagName: 'ConnectedAP', id: 'bus-a-ied1' },
						{ parent: { tagName: 'SubNetwork', id: 'bus-c' } },
					)
					await tx.move(
						{ tagName: 'ConnectedAP', id: 'bus-b-ied2' },
						{ parent: { tagName: 'SubNetwork', id: 'bus-c' } },
					)
				},
				containers: [
					'SubNetwork bus-a [name=Bus_A type=8-MMS uuid] in Communication communication, owned by nothing: emptied holds-nothing; holds nothing; goes with nothing',
				],
			},
		// GC1 sends DS1 and nothing else
		'the only entry of DS1 deleted → DS1, with GC1 cleared and revised': {
			sourceXml: twoGooseDataSetsXml,
			write: deleting([{ tagName: 'FCDA', id: 'ds1-entry' }]),
			containers: [
				'DataSet ds1 [name=DS1 uuid] in LN0 ied1-lln0, owned by LN0 IED1/LD1/LLN0: emptied holds-nothing; holds nothing; goes with GSEControl gc1 cleared, GSEControl gc1 revised',
			],
		},
		// IED1's server holds its Authentication and one logical device
		'the last logical device of a server deleted → the Server, holding its Authentication': {
			sourceXml: serverWithOneLogicalDeviceXml,
			write: deleting([{ tagName: 'LDevice', id: 'ied1-ld' }]),
			containers: [
				'Server ied1-server [] in AccessPoint ied1-ap AP1, owned by IED IED1: emptied lost-required LDevice; holds Authentication ied1-authentication; goes with nothing',
			],
		},
		// GC1 sends DS1, GC2 sends DS2, both in LLN0
		'the only entries of DS1 and DS2 deleted in one transaction → each data set with its own block only':
			{
				sourceXml: twoGooseDataSetsXml,
				write: deleting([
					{ tagName: 'FCDA', id: 'ds1-entry' },
					{ tagName: 'FCDA', id: 'ds2-entry' },
				]),
				containers: [
					'DataSet ds1 [name=DS1 uuid] in LN0 ied1-lln0, owned by LN0 IED1/LD1/LLN0: emptied holds-nothing; holds nothing; goes with GSEControl gc1 cleared, GSEControl gc1 revised',
					'DataSet ds2 [name=DS2 uuid] in LN0 ied1-lln0, owned by LN0 IED1/LD1/LLN0: emptied holds-nothing; holds nothing; goes with GSEControl gc2 cleared, GSEControl gc2 revised',
				],
			},
		// the Labels of a bay deep in the substation, the only SubNetwork of the Communication: ids sort against document order
		'a bay Label and the only connected access point deleted → the Labels, then the Communication, then the SubNetwork':
			{
				sourceXml: labelsAndLoneSubNetworkXml,
				write: deleting([
					{ tagName: 'ConnectedAP', id: 'mm-ied1' },
					{ tagName: 'Label', id: 'zz-label' },
				]),
				containers: [
					'Labels zz-labels [] in Bay b1 B1, owned by Bay S1/V1/B1: emptied holds-nothing; holds nothing; goes with nothing',
					'Communication aa-communication [] in SCL project, owned by nothing: above SubNetwork mm-bus; holds nothing; goes with nothing',
					'SubNetwork mm-bus [name=Bus_A type=8-MMS uuid] in Communication aa-communication, owned by nothing: emptied holds-nothing; holds nothing; goes with nothing',
				],
			},
		// B3's Labels keeps its English Label
		'one Label of two deleted → nothing listed': {
			sourceXml: twoLanguagesXml,
			write: deleting([{ tagName: 'Label', id: 'b3-fr' }]),
			containers: [],
		},
		// DS1 deleted by the transaction itself: a delete, not a prune
		'DS1 itself deleted → nothing listed': {
			sourceXml: twoGooseDataSetsXml,
			write: deleting([{ tagName: 'DataSet', id: 'ds1' }]),
			containers: [],
		},
		// XCBR1 is the only logical node of XCBR_T, whose DO Pos is of DPC_T, used by nothing else
		'the only logical node of a type deleted → the type and its DO type listed with their records':
			{
				sourceXml: logicalNodeWithOwnTypeXml,
				write: deleting([{ tagName: 'LN', id: 'ied1-xcbr1' }]),
				containers: [],
				types: ['LNodeType xcbr-type XCBR_T: DO xcbr-pos', 'DOType dpc-type DPC_T: DA dpc-st-val'],
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<PreviewCase>): Promise<void> {
		await expect(described({ source, write: testCase.write })).resolves.toEqual({
			containers: testCase.containers,
			types: testCase.types ?? [],
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The preview runs the commit's own steps: a transaction the commit refuses makes it throw the same error.
describe('tx.cleanUp.commitPrune - a transaction the commit refuses', () => {
	type RefusedCase = SclTest.BaseXmlTestCase & {
		/** What the transaction writes before the preview. */
		write: (tx: Scl.Transaction) => Promise<void>
		/** The key and code of the error the preview throws. */
		expected: string
	}

	const testCases: SclTest.TestCases<RefusedCase> = {
		// PTRC1 is a logical node of LD1: tuple references name it by its logical device
		'a logical node moved to another logical device → the preview throws MOVE_NOT_FOLLOWED (SCL4003)':
			{
				sourceXml: anIedAndABayXml,
				write: async function movePtrc1ToLd2(tx) {
					await tx.any.move(
						{ tagName: 'LN', id: 'ptrc1' },
						{ parent: { tagName: 'LDevice', id: 'ld2' } },
					)
				},
				expected: 'MOVE_NOT_FOLLOWED SCL4003',
			},
	}

	async function act({ testCase, source }: SclTest.ActParams<RefusedCase>): Promise<void> {
		let refused: string | undefined
		// prepare runs the commit's steps too: it refuses the same transaction, nothing is staged
		await source
			.prepare(async function writeThenPreview(tx) {
				await testCase.write(tx)
				refused = await tx.cleanUp.commitPrune().then(
					() => 'no error',
					function errorOf(error: unknown) {
						const dialecteError = toDialecteError(error)
						return `${dialecteError?.key} ${dialecteError?.code}`
					},
				)
			})
			.then(
				(prepared) => prepared.discard(),
				() => undefined,
			)
		expect(refused).toBe(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

type Source = SclTest.ActParams<SclTest.BaseXmlTestCase>['source']

/** The preview after `write`, described, the transaction discarded. */
async function described(params: {
	source: Source
	write: (tx: Scl.Transaction) => Promise<void>
}): Promise<{ containers: string[]; types: string[] }> {
	const preview = await previewed(params)
	return {
		containers: preview.containers.map(describeContainer),
		types: preview.types.map(describeType),
	}
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

/**
 * `<tag> <id> [<name, type, uuid present>] in <parent tag> <parent id> <parent name>, owned by <owner tag> <path> (or nothing): <reason>; holds
 * <records>; goes with <effects>`.
 */
function describeContainer(container: CommitPrunedContainer): string {
	const { element, identity, parent, owner, reason, holds, goesWith } = container
	// a uuid the import gave is a fresh one: only its presence is read
	const named = [
		...(['name', 'type'] as const).flatMap((key) =>
			identity[key] ? [`${key}=${identity[key]}`] : [],
		),
		...(identity.uuid ? ['uuid'] : []),
	].join(' ')
	const parentName = parent.name ? ` ${parent.name}` : ''
	const ownedBy = owner ? `${owner.tagName} ${owner.path}` : 'nothing'
	const why =
		reason.kind === 'above'
			? `above ${reason.below.tagName} ${reason.below.id}`
			: reason.rule === 'holds-nothing'
				? 'emptied holds-nothing'
				: `emptied lost-required ${reason.group.join(' ')}`
	const held =
		holds.length === 0
			? 'nothing'
			: holds.map((record) => `${record.tagName} ${record.id}`).join(', ')
	const outside =
		goesWith.length === 0
			? 'nothing'
			: goesWith
					.map((effect) => `${effect.element.tagName} ${effect.element.id} ${effect.effect}`)
					.join(', ')
	return `${element.tagName} ${element.id} [${named}] in ${parent.tagName} ${parent.id}${parentName}, owned by ${ownedBy}: ${why}; holds ${held}; goes with ${outside}`
}

/** `<tag> <id> <type id>: <records>`. */
function describeType(type: CommitPrune['types'][number]): string {
	const held = type.holds.map((record) => `${record.tagName} ${record.id}`).join(', ')
	return `${type.element.tagName} ${type.element.id} ${type.identity.id ?? ''}: ${held}`
}
