import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribeBound from './fixtures/unsubscribe/unsubscribe-bound.xml?raw'
import unsubscribeNoIntAddr from './fixtures/unsubscribe/unsubscribe-no-intaddr.xml?raw'

import { describe } from 'vitest'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

const S_GENERAL = '//default:IED[@name="S"]//default:ExtRef[@intAddr="in1"]'
const S_Q = '//default:IED[@name="S"]//default:ExtRef[@intAddr="in2"]'
const GCB = '//default:IED[@name="P"]//default:GSEControl[@name="gcb"]'

/** The binding of an ended subscription, and the signals it implemented. */
describe('unsubscribe - the binding and the signals', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		'S’s stVal-level general ExtRef with intAddr, its q companion, the SourceRef linked → both unbound, the signal unlinked, S’s IEDName and LGOS value gone':
			{
				sourceXml: unsubscribeBound,
				extRefs: ['ext-s-general'],
				result: {
					unbound: ['ext-s-general', 'ext-s-q'],
					unlinked: ['source-ref'],
					registrations: [{ element: 'iedname-s', effect: 'deleted' }],
					supervisions: ['dai-lgos-s'],
				},
				expectedQueries: [
					`${S_GENERAL}[@uuid][@pDO="Op"]`,
					`${S_Q}[@uuid]`,
					`${GCB}/default:IEDName[.="T"]`,
					'//default:IED[@name="S"]//default:ExtRef[@serviceType="Report"]',
					'//default:IED[@name="S"]//default:LN[@lnClass="LGOS"]/default:DOI[@name="GoCBRef"]',
				],
				unexpectedQueries: [
					`${S_GENERAL}[@iedName or @ldInst or @lnClass or @doName or @daName or @srcCBName or @serviceType]`,
					`${S_Q}[@srcCBName]`,
					`${GCB}/default:IEDName[.="S"]`,
					'//v2019C1:SourceRef[@extRefUuid]',
					'//default:IED[@name="S"]//default:LN[@lnClass="LGOS"]//default:Val',
				],
			},
		'withCompanions false → only general unbound, q still subscribed, S’s IEDName and LGOS value kept':
			{
				sourceXml: unsubscribeBound,
				extRefs: ['ext-s-general'],
				withCompanions: false,
				result: { unbound: ['ext-s-general'], unlinked: ['source-ref'] },
				expectedQueries: [`${S_Q}[@srcCBName="gcb"]`, `${GCB}/default:IEDName[.="S"]`],
			},
		'an ExtRef without intAddr → removed, S’s IEDName and LGOS value gone': {
			sourceXml: unsubscribeNoIntAddr,
			extRefs: ['ext-s-noaddr'],
			result: {
				removed: ['ext-s-noaddr'],
				registrations: [{ element: 'iedname-s', effect: 'deleted' }],
				supervisions: ['dai-lgos-s'],
			},
			unexpectedQueries: [
				'//default:IED[@name="S"]//default:ExtRef',
				`${GCB}/default:IEDName[.="S"]`,
			],
		},
	}

	runUnsubscribeCases({ testCases })
})
