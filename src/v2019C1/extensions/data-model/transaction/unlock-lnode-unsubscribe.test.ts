import unsubscribeXml from './fixtures/unlock-lnode/unsubscribe.xml?raw'
import { unlockLNode } from './unlock-lnode'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { UnlockLNodeResult } from './unlock-lnode.types'
import type { UnsubscribeResult } from '@/v2019C1/extensions/dataflow/transaction/unsubscribe.types'
import type { SclTest } from '@/v2019C1/test'

type UnsubscribeIds = {
	unbound: string[]
	removed: string[]
	unlinked: string[]
	registrations: { element: string; effect: 'deleted' | 'cleared' }[]
	supervisions: string[]
	kept: UnsubscribeResult['kept']
}

describe('unlockLNode: subscriptions', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		unsubscribeOthers?: boolean
		expected: UnsubscribeIds
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// The target receives Op.stVal plus a q companion from P; R subscribes to the target's Pos.stVal.
		'by default -> its own ExtRefs and companions end; other LNodes stay subscribed': {
			sourceXml: unsubscribeXml,
			expectedQueries: [
				'//default:ExtRef[@intAddr="Trip.stVal"][not(@iedName)]',
				'//default:ExtRef[@intAddr="Trip.q"][not(@iedName)]',
				'//v2019C1:SourceRef[@input="Trip"][not(@extRefUuid)]',
				'//default:ExtRef[@intAddr="State.stVal"][@iedName="T"]',
				'//v2019C1:SourceRef[@input="State"][@extRefUuid]',
				'//default:GSEControl[@appID="T-GCB"]/default:IEDName[text()="R"]',
			],
			unexpectedQueries: [
				'//default:ExtRef[@intAddr="Trip.stVal"][@iedName]',
				'//default:ExtRef[@intAddr="Trip.q"][@iedName]',
				'//default:GSEControl[@appID="P-GCB"]/default:IEDName',
			],
			expected: {
				unbound: ['target-ext-q', 'target-ext-stval'],
				removed: [],
				unlinked: ['target-source'],
				registrations: [{ element: 'registration-p', effect: 'deleted' }],
				supervisions: [],
				kept: [],
			},
		},
		// The same target and subscriptions exercise the explicit opt-in for ending R's input.
		'unsubscribeOthers -> other LNodes subscribing to its data end too': {
			sourceXml: unsubscribeXml,
			unsubscribeOthers: true,
			expectedQueries: [
				'//default:ExtRef[@intAddr="Trip.stVal"][not(@iedName)]',
				'//default:ExtRef[@intAddr="Trip.q"][not(@iedName)]',
				'//default:ExtRef[@intAddr="State.stVal"][not(@iedName)]',
				'//v2019C1:SourceRef[@input="Trip"][not(@extRefUuid)]',
				'//v2019C1:SourceRef[@input="State"][not(@extRefUuid)]',
			],
			unexpectedQueries: [
				'//default:GSEControl[@appID="P-GCB"]/default:IEDName',
				'//default:GSEControl[@appID="T-GCB"]/default:IEDName',
			],
			expected: {
				unbound: ['receiver-ext', 'target-ext-q', 'target-ext-stval'],
				removed: [],
				unlinked: ['receiver-source', 'target-source'],
				registrations: [
					{ element: 'registration-p', effect: 'deleted' },
					{ element: 'registration-target', effect: 'deleted' },
				],
				supervisions: [],
				kept: [],
			},
		},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await source.transaction((tx) =>
				unlockLNode(tx, {
					lnode: { tagName: 'LNode', id: 'lnode-target' },
					...(testCase.unsubscribeOthers && { unsubscribeOthers: true }),
				}),
			)
			expect(result).toHaveProperty('unsubscribe')
			expect(unsubscribeIds(result)).toEqual(testCase.expected)
			return { assertOn: 'source' }
		},
	})
})

function unsubscribeIds(result: UnlockLNodeResult): UnsubscribeIds {
	const { unsubscribe } = result
	return {
		unbound: unsubscribe.unbound.map(({ id }) => id).sort(),
		removed: unsubscribe.removed.map(({ id }) => id).sort(),
		unlinked: unsubscribe.unlinked.map(({ id }) => id).sort(),
		registrations: unsubscribe.registrations
			.map(({ element, effect }) => ({ element: element.id, effect }))
			.sort((left, right) => left.element.localeCompare(right.element)),
		supervisions: unsubscribe.supervisions.map(({ id }) => id).sort(),
		kept: unsubscribe.kept,
	}
}
