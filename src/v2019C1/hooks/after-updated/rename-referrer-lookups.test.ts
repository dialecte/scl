/// <reference types="vite/client" />
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})
const GENERATED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const subscriptions = FIXTURES['./fixtures/subscriptions-of-every-kind.xml']

/** A rename, and the records it stages an update of. */
type TestCase = SclTest.BaseXmlTestCase & {
	rename: {
		tagName: 'IED' | 'AccessPoint' | 'LDevice' | 'LN' | 'GSEControl'
		id: string
		attributes: Record<string, string>
	}
	/** The records the transaction stages an update of, in order: by id, by tag for an id the transaction made. */
	expectedUpdates: string[]
}

const withGhost = {
	sourceXml: subscriptions,
	allowIncoherentReferences:
		'the ghost ExtRef names by uuid no element: the reference naming nothing is the case',
}

const namesOnlyLeftAbsent = {
	allowInvalidOutput: {
		reason:
			'the references naming by names only what the document does not hold are left naming nothing',
		violations: [{ check: 'references' as const, code: 'absent' }],
	},
}

describe('a rename writes the same references, in the same order, whatever the referrers', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'P2 renamed -> every referrer naming it by uuid or by names only follows, the ghost and own references stay':
			{
				...withGhost,
				...namesOnlyLeftAbsent,
				rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
				expectedUpdates: [
					'p2',
					'LNodeSpecNaming:*',
					'LNodeSpecNaming:*',
					'p1-names-only',
					'lnode-names-only',
					'p2-connected-ap',
					'p1-both',
					'p1-cb-only',
					'p1-ln-only',
					'p1-twice',
					'lnode-bound',
					'p2',
				],
				expectedQueries: [
					'//default:ExtRef[@intAddr="Pos"][@iedName="P9"]',
					'//default:ExtRef[@intAddr="Beh"][@iedName="P9"]',
					'//default:ExtRef[@intAddr="Cb"][@iedName="P9"]',
					'//default:ExtRef[@intAddr="Pos2"][@iedName="P9"]',
					'//default:ExtRef[@intAddr="BlkOpn"][@iedName="P9"]',
					'//default:ExtRef[@intAddr="Ghost"][@iedName="P2"]',
					'//default:ExtRef[@intAddr="Own"][@iedName="@"]',
					'//default:ConnectedAP[@apUuid="p2-ap-uuid"][@iedName="P9"]',
					'//default:LNode[@uuid="lnode-bound-uuid"][@iedName="P9"]',
					'//default:LNode[@uuid="lnode-names-only-uuid"][@iedName="P9"]',
				],
			},
		'P1 renamed -> its ClientLN, IEDName and ConnectedAP follow, by uuid and by names only': {
			...withGhost,

			rename: { tagName: 'IED', id: 'p1', attributes: { name: 'P8' } },
			expectedUpdates: [
				'p1',
				'p2-client-names-only',
				'p2-subscriber-names-only',
				'p2-client',
				'p1-connected-ap',
				'p2-subscriber',
				'p2-subscriber-ld',
				'p1',
			],
			expectedQueries: [
				'//default:ClientLN[@lnUuid="p1-lln0-uuid"][@iedName="P8"]',
				'//default:ClientLN[not(@lnUuid)][@iedName="P8"]',
				'//default:IEDName[@apUuid="p1-ap-uuid"][.="P8"]',
				'//default:IEDName[@ldUuid="p1-ld-uuid"][.="P8"]',
				'//default:IEDName[not(@apUuid)][not(@ldUuid)][.="P8"]',
				'//default:ConnectedAP[@apUuid="p1-ap-uuid"][@iedName="P8"]',
			],
		},
		'P2 logical device renamed -> the referrers naming it or a node below it by uuid follow': {
			...withGhost,
			rename: { tagName: 'LDevice', id: 'p2-ld', attributes: { inst: 'LD5' } },
			expectedUpdates: [
				'p2-ld',
				'p1-both',
				'p1-cb-only',
				'p1-ln-only',
				'p1-twice',
				'p2-fcda',
				'p2-gse',
				'lnode-bound',
			],
			expectedQueries: [
				'//default:ExtRef[@intAddr="Pos"][@ldInst="LD5"][@srcLDInst="LD5"]',
				'//default:ExtRef[@intAddr="Beh"][@ldInst="LD5"]',
				'//default:ExtRef[@intAddr="Cb"][@srcLDInst="LD5"]',
				'//default:ExtRef[@intAddr="BlkOpn"][@ldInst="LD0"]',
				'//default:GSE[@ldInst="LD5"]',
				'//default:LNode[@uuid="lnode-bound-uuid"][@ldInst="LD5"]',
			],
		},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction((tx) => expectRenameUpdates({ tx, testCase }))
			return { assertOn: 'source' }
		},
	})
})

describe('a rename after staged changes of its referrers writes the staged referrers', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'P2 renamed after a staged create, update and delete of its referrers -> the staged referrers follow':
			{
				...withGhost,
				...namesOnlyLeftAbsent,
				rename: { tagName: 'IED', id: 'p2', attributes: { name: 'P9' } },
				expectedUpdates: [
					'p2',
					'LNodeSpecNaming:*',
					'LNodeSpecNaming:*',
					'p1-names-only',
					'lnode-names-only',
					'p2-connected-ap',
					'p1-both',
					'p1-ghost',
					'p1-ln-only',
					'p1-twice',
					'ExtRef:*',
					'lnode-bound',
					'p2',
				],
				expectedQueries: [
					'//default:ExtRef[@intAddr="Created"][@iedName="P9"]',
					'//default:ExtRef[@intAddr="Ghost"][@iedName="P9"]',
					'//default:ExtRef[@intAddr="Pos"][@iedName="P9"]',
				],
				unexpectedQueries: ['//default:ExtRef[@intAddr="Cb"]'],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction(async (tx) => {
				// staged in the transaction of the rename: a referrer created, one rebound to P2, one deleted
				await tx.any.addChild(
					{ tagName: 'Inputs', id: 'p1-inputs' },
					{
						tagName: 'ExtRef',
						attributes: {
							iedName: 'P2',
							ldInst: 'LD0',
							prefix: 'Q0',
							lnClass: 'XCBR',
							lnInst: '2',
							doName: 'Pos',
							lnUuid: 'p2-breaker-uuid',
							intAddr: 'Created',
						},
					},
				)
				await tx.any.update(
					{ tagName: 'ExtRef', id: 'p1-ghost' },
					{ attributes: { lnInst: '2', lnUuid: 'p2-breaker-uuid' } },
				)
				await tx.any.delete({ tagName: 'ExtRef', id: 'p1-cb-only' })
				await expectRenameUpdates({ tx, testCase })
			})
			return { assertOn: 'source' }
		},
	})
})

/** Renames as the case says and expects the updates the rename stages after what the transaction staged before. */
async function expectRenameUpdates(params: {
	tx: Scl.Transaction
	testCase: TestCase
}): Promise<void> {
	const { tx, testCase } = params
	const { tagName, id: recordId, attributes } = testCase.rename
	const staged = tx.getStagedOperations().length
	await tx.any.update({ tagName, id: recordId }, { attributes })
	const updates = tx
		.getStagedOperations()
		.slice(staged)
		.flatMap((operation) =>
			operation.status === 'updated' ? [describeUpdate(operation.newRecord)] : [],
		)
	expect(updates).toEqual(testCase.expectedUpdates)
}

/** A record by its id, or by its tag when its id was made by the transaction (not stable from run to run). */
function describeUpdate(record: { tagName: string; id: string }): string {
	return GENERATED_ID.test(record.id) ? `${record.tagName}:*` : record.id
}
