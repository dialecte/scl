import { unsubscribe } from '../unsubscribe'

import { expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { KeptRegistrationReason } from '../../query/plan-subscription-bookkeeping.types'
import type { UnsubscribeResult } from '../unsubscribe.types'
import type { SclTest } from '@/v2019C1/test'

/** An unsubscribe result with every element named by its `dev:db-id`. */
export type UnsubscribeResultIds = {
	unbound: string[]
	removed: string[]
	unlinked: string[]
	registrations: { element: string; effect: 'deleted' | 'cleared' }[]
	supervisions: string[]
	kept: { element: string; why: KeptRegistrationReason }[]
}

/** The ExtRefs ended, by id, and what the result lists (any part left out is expected empty). */
export type UnsubscribeTestCase = SclTest.BaseXmlTestCase & {
	extRefs: string[]
	withCompanions?: boolean
	result: Partial<UnsubscribeResultIds>
}

const NOTHING: UnsubscribeResultIds = {
	unbound: [],
	removed: [],
	unlinked: [],
	registrations: [],
	supervisions: [],
	kept: [],
}

/** Ends the subscriptions of each case in a transaction; the document by its queries. */
export function runUnsubscribeCases(params: {
	testCases: SclTest.TestCases<UnsubscribeTestCase>
}): void {
	runSclTestCases.withExport<UnsubscribeTestCase>({
		testCases: params.testCases,
		act: async ({ source, testCase }) => {
			const ended = source.transaction((tx) =>
				unsubscribe(tx, {
					extRefs: testCase.extRefs.map((id) => ({ tagName: 'ExtRef', id })),
					...(testCase.withCompanions === false && { withCompanions: false }),
				}),
			)
			await expect(ended.then(idsOf)).resolves.toEqual({ ...NOTHING, ...testCase.result })
		},
	})
}

function idOf(ref: { id?: string }): string {
	return ref.id ?? ''
}

function idsOf(result: UnsubscribeResult): UnsubscribeResultIds {
	return {
		unbound: result.unbound.map(idOf),
		removed: result.removed.map(idOf),
		unlinked: result.unlinked.map(idOf),
		registrations: result.registrations.map((operation) => ({
			element: idOf(operation.element),
			effect: operation.effect,
		})),
		supervisions: result.supervisions.map(idOf),
		kept: result.kept.map((entry) => ({ element: idOf(entry.element), why: entry.why })),
	}
}
