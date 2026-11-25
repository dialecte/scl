import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribeOneClearedOneDeleted from './fixtures/unsubscribe/unsubscribe-one-cleared-one-deleted.xml?raw'
import unsubscribeOneLnRegistered from './fixtures/unsubscribe/unsubscribe-one-ln-registered.xml?raw'
import unsubscribeThreeLns from './fixtures/unsubscribe/unsubscribe-three-lns.xml?raw'

import { describe } from 'vitest'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

const GCB = '//default:GSEControl[@name="gcb"]'

/** While some of its ExtRefs still use the control block, a subscriber stays registered once, never more widely. */
describe('unsubscribe - a registration naming a logical node whose ExtRefs end', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		// S's GGIO1 and GGIO2 subscribe to gcb, only GGIO1 is registered, at its logical node
		'GGIO1’s ExtRef ended, GGIO2’s registered nowhere → GGIO1’s IEDName cleared to S': {
			sourceXml: unsubscribeOneLnRegistered,
			extRefs: ['ext-s-general'],
			result: {
				unbound: ['ext-s-general'],
				registrations: [{ element: 'iedname-s-ggio1', effect: 'cleared' }],
			},
			expectedQueries: [`${GCB}/default:IEDName[.="S"][not(@ldInst or @lnClass or @lnInst)]`],
		},
		// S's GGIO1, GGIO2 and GGIO3 subscribe to gcb, each registered at its logical node
		'GGIO1’s and GGIO3’s ExtRefs ended, GGIO2’s registered → their IEDNames removed, only S/LD0/GGIO2 left':
			{
				sourceXml: unsubscribeThreeLns,
				extRefs: ['ext-s-general', 'ext-s-ggio3'],
				result: {
					unbound: ['ext-s-general', 'ext-s-ggio3'],
					registrations: [
						{ element: 'iedname-s-ggio1', effect: 'deleted' },
						{ element: 'iedname-s-ggio3', effect: 'deleted' },
					],
				},
				expectedQueries: [`${GCB}/default:IEDName[.="S"][@lnClass="GGIO"][@lnInst="2"]`],
				unexpectedQueries: [
					`${GCB}/default:IEDName[.="S"][@lnInst="1" or @lnInst="3"]`,
					`${GCB}/default:IEDName[.="S"][not(@lnClass)]`,
				],
			},
		// S's GGIO1, GGIO2 and GGIO3 subscribe to gcb, GGIO1 and GGIO3 registered at their logical node, GGIO2 nowhere
		'GGIO1’s and GGIO3’s ExtRefs ended, GGIO2’s registered nowhere → GGIO1’s IEDName cleared to S, GGIO3’s removed':
			{
				sourceXml: unsubscribeOneClearedOneDeleted,
				extRefs: ['ext-s-general', 'ext-s-ggio3'],
				result: {
					unbound: ['ext-s-general', 'ext-s-ggio3'],
					registrations: [
						{ element: 'iedname-s-ggio1', effect: 'cleared' },
						{ element: 'iedname-s-ggio3', effect: 'deleted' },
					],
				},
				expectedQueries: [`${GCB}/default:IEDName[.="S"][not(@ldInst or @lnClass or @lnInst)]`],
				unexpectedQueries: [`${GCB}/default:IEDName[.="S"][@lnClass]`],
			},
	}

	runUnsubscribeCases({ testCases })
})
