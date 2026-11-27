import { runUnsubscribeCases } from './__tests__/unsubscribe-cases'
import unsubscribeCleanupRights from './fixtures/unsubscribe/unsubscribe-cleanup-rights.xml?raw'
import unsubscribeCleanup from './fixtures/unsubscribe/unsubscribe-cleanup.xml?raw'

import { describe } from 'vitest'

import type { UnsubscribeTestCase } from './__tests__/unsubscribe-cases'
import type { SclTest } from '@/v2019C1/test'

describe('unsubscribe - unused-data cleanup', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		'with cleanup unused-data → unread FCDAs and then empty data sets and control blocks go, while remaining readers keep them':
			{
				sourceXml: unsubscribeCleanup,
				extRefs: ['ext-shared-general', 'ext-unused-general', 'ext-unused-q'],
				withCompanions: false,
				cleanup: 'unused-data',
				result: {
					unbound: ['ext-shared-general', 'ext-unused-general', 'ext-unused-q'],
					registrations: [
						{ element: 'registration-shared-s', effect: 'deleted' },
						{ element: 'registration-unused-s', effect: 'deleted' },
					],
					kept: [
						{ element: 'fcda-shared-general', why: 'used' },
						{ element: 'fcda-shared-q', why: 'used' },
						{ element: 'ds-shared', why: 'used' },
						{ element: 'cb-shared', why: 'used' },
					],
					fcdas: ['fcda-unused-general', 'fcda-unused-q'],
					dataSets: ['ds-unused'],
					controlBlocks: ['cb-unused'],
					confRevs: [],
				},
				expectedQueries: [
					'//default:DataSet[@name="DS-shared"]/default:FCDA[@daName="q"]',
					'//default:GSEControl[@name="g-shared"][@confRev="7"]',
					'//default:ConnectedAP/default:GSE[@cbName="g-shared"]',
				],
				unexpectedQueries: [
					'//default:DataSet[@name="DS-unused"]',
					'//default:GSEControl[@name="g-unused"]',
					'//default:GSE[@cbName="g-unused"]',
				],
			},
	}

	runUnsubscribeCases({ testCases })
})

describe('unsubscribe - unused-data cleanup capabilities', () => {
	const testCases: SclTest.TestCases<UnsubscribeTestCase> = {
		'control-block setting Fix → its data set goes and the block stays fixed': {
			sourceXml: unsubscribeCleanupRights,
			extRefs: ['ext-fixed'],
			cleanup: 'unused-data',
			result: {
				unbound: ['ext-fixed'],
				registrations: [{ element: 'registration-fixed', effect: 'deleted' }],
				kept: [{ element: 'cb-fixed', why: 'fixed' }],
				fcdas: ['fcda-fixed'],
				dataSets: ['ds-fixed'],
				confRevs: [{ controlBlock: 'cb-fixed', from: '1', to: '10001' }],
			},
			expectedQueries: ['//default:GSEControl[@name="g-fixed"][not(@datSet)][@confRev="10001"]'],
			unexpectedQueries: ['//default:DataSet[@name="DS-fixed"]'],
		},
		'data sets cannot be modified → their entry, data set and control block stay': {
			sourceXml: unsubscribeCleanupRights,
			extRefs: ['ext-blocked'],
			cleanup: 'unused-data',
			result: {
				unbound: ['ext-blocked'],
				registrations: [{ element: 'registration-blocked', effect: 'deleted' }],
				kept: [
					{ element: 'fcda-blocked', why: 'not-modifiable' },
					{ element: 'ds-blocked', why: 'not-modifiable' },
					{ element: 'cb-blocked', why: 'used' },
				],
			},
		},
		'publisher engineering right fix → all publisher cleanup stays': {
			sourceXml: unsubscribeCleanupRights,
			extRefs: ['ext-right'],
			cleanup: 'unused-data',
			result: {
				unbound: ['ext-right'],
				kept: [
					{ element: 'registration-right', why: 'eng-right-fix' },
					{ element: 'fcda-right', why: 'engright' },
					{ element: 'ds-right', why: 'engright' },
					{ element: 'cb-right', why: 'engright' },
				],
			},
		},
		'sampled-value capability → its unused publisher data goes, a retained report registration keeps its data':
			{
				sourceXml: unsubscribeCleanupRights,
				extRefs: ['ext-sv', 'ext-report'],
				cleanup: 'unused-data',
				result: {
					unbound: ['ext-sv', 'ext-report'],
					registrations: [{ element: 'registration-sv', effect: 'deleted' }],
					kept: [
						{ element: 'registration-report', why: 'indexed-position' },
						{ element: 'fcda-report', why: 'used' },
						{ element: 'ds-report', why: 'used' },
						{ element: 'cb-report', why: 'used' },
					],
					fcdas: ['fcda-sv'],
					dataSets: ['ds-sv'],
					controlBlocks: ['cb-sv'],
				},
			},
		'a fixed data-set reference → the entry and data set stay while the registration goes': {
			sourceXml: unsubscribeCleanupRights,
			extRefs: ['ext-data-set-fixed'],
			cleanup: 'unused-data',
			result: {
				unbound: ['ext-data-set-fixed'],
				registrations: [{ element: 'registration-data-set-fixed', effect: 'deleted' }],
				kept: [
					{ element: 'fcda-data-set-fixed', why: 'fixed' },
					{ element: 'ds-data-set-fixed', why: 'fixed' },
					{ element: 'cb-data-set-fixed', why: 'fixed' },
				],
			},
		},
	}

	runUnsubscribeCases({ testCases })
})
