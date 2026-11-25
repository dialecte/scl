import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribeBufferedOne from './fixtures/unsubscribe/unsubscribe-buffered-one.xml?raw'
import unsubscribeIndexedZero from './fixtures/unsubscribe/unsubscribe-indexed-zero.xml?raw'

import { describe } from 'vitest'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

const RCB = '//default:IED[@name="P"]//default:ReportControl[@name="rcb"]'

/** A report control block's `buffered` and `indexed` read in both lexical forms of a boolean. */
describe('unsubscribe - buffered and indexed written as 1 and 0', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		// rcb is buffered="1", S's ClientLN the last of two
		'buffered="1", S’s report ExtRef ended → its ClientLN kept, buffered-preconfigured': {
			sourceXml: unsubscribeBufferedOne,
			extRefs: ['ext-s-report'],
			result: {
				unbound: ['ext-s-report'],
				kept: [{ element: 'clientln-s', why: 'buffered-preconfigured' }],
			},
			expectedQueries: [`${RCB}//default:ClientLN[@iedName="S"]`],
		},
		// rcb is indexed="0", S's ClientLN the first of two
		'indexed="0", S’s report ExtRef ended, its ClientLN first → removed, its position no instance number':
			{
				sourceXml: unsubscribeIndexedZero,
				extRefs: ['ext-s-report'],
				result: {
					unbound: ['ext-s-report'],
					registrations: [{ element: 'clientln-s', effect: 'deleted' }],
				},
				unexpectedQueries: [`${RCB}//default:ClientLN[@iedName="S"]`],
			},
	}

	runUnsubscribeCases({ testCases })
})
