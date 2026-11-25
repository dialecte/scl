import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribeBuffered from './fixtures/unsubscribe/unsubscribe-buffered.xml?raw'
import unsubscribeIndexedFirst from './fixtures/unsubscribe/unsubscribe-indexed-first.xml?raw'
import unsubscribeIndexedLast from './fixtures/unsubscribe/unsubscribe-indexed-last.xml?raw'
import unsubscribeTwoLns from './fixtures/unsubscribe/unsubscribe-two-lns.xml?raw'

import { describe } from 'vitest'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

const RCB = '//default:IED[@name="P"]//default:ReportControl[@name="rcb"]'

/** A registration goes only when none of its subscriber's ExtRefs uses the control block, and never shifts other clients. */
describe('unsubscribe - registrations by reference count', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		'S subscribes to gcb from GGIO1 and GGIO2, GGIO1’s ended → S’s IEDName kept, nothing to clear':
			{
				sourceXml: unsubscribeTwoLns,
				extRefs: ['ext-s-general'],
				result: { unbound: ['ext-s-general'] },
				expectedQueries: ['//default:GSEControl[@name="gcb"]/default:IEDName[.="S"]'],
			},
		'S’s report ExtRef ended, its ClientLN first of two in an indexed RptEnabled → kept, indexed-position':
			{
				sourceXml: unsubscribeIndexedFirst,
				extRefs: ['ext-s-report'],
				result: {
					unbound: ['ext-s-report'],
					kept: [{ element: 'clientln-s', why: 'indexed-position' }],
				},
				expectedQueries: [`${RCB}//default:ClientLN[@iedName="S"]`],
			},
		'S’s report ExtRef ended, its ClientLN last → removed, T keeps its instance': {
			sourceXml: unsubscribeIndexedLast,
			extRefs: ['ext-s-report'],
			result: {
				unbound: ['ext-s-report'],
				registrations: [{ element: 'clientln-s', effect: 'deleted' }],
			},
			expectedQueries: [`${RCB}//default:ClientLN[1][@iedName="T"]`],
			unexpectedQueries: [`${RCB}//default:ClientLN[@iedName="S"]`],
		},
		'S’s report ExtRef ended on a buffered RCB → its ClientLN kept, buffered-preconfigured': {
			sourceXml: unsubscribeBuffered,
			extRefs: ['ext-s-report'],
			result: {
				unbound: ['ext-s-report'],
				kept: [{ element: 'clientln-s', why: 'buffered-preconfigured' }],
			},
			expectedQueries: [`${RCB}//default:ClientLN[@iedName="S"]`],
		},
	}

	runUnsubscribeCases({ testCases })
})
