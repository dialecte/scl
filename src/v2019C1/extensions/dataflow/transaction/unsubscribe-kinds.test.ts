import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribeGooseOtherLn from './fixtures/unsubscribe/unsubscribe-goose-other-ln.xml?raw'
import unsubscribeReportPureAndTwoClients from './fixtures/unsubscribe/unsubscribe-report-pure-and-two-clients.xml?raw'
import unsubscribeReportPureClient from './fixtures/unsubscribe/unsubscribe-report-pure-client.xml?raw'
import unsubscribeReportTwoClients from './fixtures/unsubscribe/unsubscribe-report-two-clients.xml?raw'

import { describe } from 'vitest'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

/**
 * A subscriber's last ExtRef on a control block ended: a GOOSE / SV subscriber is its IED, a report client is a logical
 * node.
 */
describe('unsubscribe - the last ExtRef, by kind of control block', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		// S's only ExtRef on gcb sits in GGIO1, S is registered at its IHMI1
		'GOOSE: S’s last ExtRef ended, S registered at another logical node → that IEDName removed': {
			sourceXml: unsubscribeGooseOtherLn,
			extRefs: ['ext-s-general'],
			result: {
				unbound: ['ext-s-general'],
				registrations: [{ element: 'iedname-s-ihmi1', effect: 'deleted' }],
				supervisions: ['dai-lgos-s'],
			},
			unexpectedQueries: ['//default:GSEControl[@name="gcb"]/default:IEDName[.="S"]'],
		},
		// S's report ExtRef sits in GGIO1, its ClientLN names IHMI1, the last client of rcb
		'report: S’s last ExtRef ended, its ClientLN naming another logical node → the client stays': {
			sourceXml: unsubscribeReportPureClient,
			extRefs: ['ext-s-report'],
			result: { unbound: ['ext-s-report'] },
			expectedQueries: [
				'//default:ReportControl[@name="rcb"]//default:ClientLN[@iedName="S"][@lnClass="IHMI"]',
			],
		},
		// S's GGIO1 and GGIO2 both receive rcb, each registered by its own ClientLN, GGIO1's the last client
		'report: GGIO1’s ExtRef ended, GGIO2’s still subscribed → GGIO1’s ClientLN removed, GGIO2’s stays':
			{
				sourceXml: unsubscribeReportTwoClients,
				extRefs: ['ext-s-ggio1-report'],
				result: {
					unbound: ['ext-s-ggio1-report'],
					registrations: [{ element: 'clientln-s-ggio1', effect: 'deleted' }],
				},
				expectedQueries: ['//default:ClientLN[@iedName="S"][@lnClass="GGIO"][@lnInst="2"]'],
				unexpectedQueries: ['//default:ClientLN[@iedName="S"][@lnClass="GGIO"][@lnInst="1"]'],
			},
		// S's GGIO1 and GGIO2 receive rcb; S's clients: IHMI1 (no ExtRef), GGIO2, GGIO1 (the last client)
		'report: GGIO1’s ExtRef ended beside a pure client of S → GGIO1’s ClientLN removed, IHMI1’s and GGIO2’s stay':
			{
				sourceXml: unsubscribeReportPureAndTwoClients,
				extRefs: ['ext-s-ggio1-report'],
				result: {
					unbound: ['ext-s-ggio1-report'],
					registrations: [{ element: 'clientln-s-ggio1', effect: 'deleted' }],
				},
				expectedQueries: [
					'//default:ClientLN[@iedName="S"][@lnClass="IHMI"][@lnInst="1"]',
					'//default:ClientLN[@iedName="S"][@lnClass="GGIO"][@lnInst="2"]',
				],
				unexpectedQueries: ['//default:ClientLN[@iedName="S"][@lnClass="GGIO"][@lnInst="1"]'],
			},
	}

	runUnsubscribeCases({ testCases })
})
