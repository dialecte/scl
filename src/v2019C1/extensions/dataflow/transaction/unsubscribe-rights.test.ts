import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribePublisherFix from './fixtures/unsubscribe/unsubscribe-publisher-fix.xml?raw'
import unsubscribeSubscriberFix from './fixtures/unsubscribe/unsubscribe-subscriber-fix.xml?raw'
import { unsubscribe } from './unsubscribe'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

/** An IED whose engineering right is fix is never changed. */
describe('unsubscribe - a publisher whose engineering right is fix', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		'P engRight fix, S’s GOOSE ExtRef ended → S’s ExtRef unbound and LGOS value cleared, P’s IEDName for S kept':
			{
				sourceXml: unsubscribePublisherFix,
				extRefs: ['ext-s-general'],
				result: {
					unbound: ['ext-s-general'],
					supervisions: ['dai-lgos-s'],
					kept: [{ element: 'iedname-s', why: 'eng-right-fix' }],
				},
				expectedQueries: ['//default:GSEControl[@name="gcb"]/default:IEDName[.="S"]'],
			},
	}

	runUnsubscribeCases({ testCases })
})

describe('unsubscribe - a subscriber whose engineering right is fix', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refusal: { key: string; reason: string; ied: string }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'S engRight fix, its ExtRef given → refused, nothing written': {
			sourceXml: unsubscribeSubscriberFix,
			refusal: { key: 'DATAFLOW_UNSUBSCRIBE_REFUSED', reason: 'eng-right-fix', ied: 'ied-s' },
			expectedQueries: ['//default:IED[@name="S"]//default:ExtRef[@srcCBName="gcb"]'],
		},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const ended = source.transaction((tx) =>
				unsubscribe(tx, { extRefs: [{ tagName: 'ExtRef', id: 'ext-s-general' }] }),
			)
			const refused = ended.then(
				() => ({ key: 'nothing thrown', reason: '', ied: '' }),
				(error: unknown) => {
					const refusal = toDialecteError(error)
					const meta = refusal?.meta as { reason?: string; ied?: { id?: string } } | undefined
					return {
						key: refusal?.key ?? String(error),
						reason: meta?.reason ?? '',
						ied: meta?.ied?.id ?? '',
					}
				},
			)
			await expect(refused).resolves.toEqual(testCase.refusal)
		},
	})
})
