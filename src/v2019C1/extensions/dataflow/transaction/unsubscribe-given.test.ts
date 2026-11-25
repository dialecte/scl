import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribeNoIntAddr from './fixtures/unsubscribe/unsubscribe-no-intaddr.xml?raw'

import { describe } from 'vitest'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

/** The ExtRefs given: each ended once, however often it is named. */
describe('unsubscribe - the ExtRefs given', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		// S's only ExtRef on gcb holds no internal address
		'S’s ExtRef without intAddr given twice, without its companions → removed once, S’s IEDName and LGOS value gone':
			{
				sourceXml: unsubscribeNoIntAddr,
				extRefs: ['ext-s-noaddr', 'ext-s-noaddr'],
				withCompanions: false,
				result: {
					removed: ['ext-s-noaddr'],
					registrations: [{ element: 'iedname-s', effect: 'deleted' }],
					supervisions: ['dai-lgos-s'],
				},
				unexpectedQueries: ['//default:IED[@name="S"]//default:ExtRef'],
			},
	}

	runUnsubscribeCases({ testCases })
})
