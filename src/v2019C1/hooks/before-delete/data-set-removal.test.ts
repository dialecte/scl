import dataSetReportedAndLogged from './fixtures/a-data-set-reported-and-logged.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('a data set that goes, by what removes it: its report and its log lose it', () => {
	type TestCase = SclTest.BaseXmlTestCase & { deleted: Scl.Ref<Scl.ElementsOf> }

	const testCases: SclTest.TestCases<TestCase> = {
		// a-data-set-reported-and-logged.xml: DS's only entry names XCBR1; the report (confRev 3) and the log send DS
		'the breaker its only entry names deleted → the data set goes, the report and the log lose it, the report revision rises once':
			{
				sourceXml: dataSetReportedAndLogged,
				deleted: { tagName: 'LN', id: 'xcbr7' },
				expectedQueries: [
					'//default:ReportControl[@name="RC"][@confRev="10003"]',
					'//default:LogControl[@name="LC"][@logName="L1"]',
				],
				unexpectedQueries: ['//default:DataSet', '//default:*[@datSet]'],
			},
		// the same data set, deleted itself
		'the data set deleted → the report and the log lose it, the report revision rises once': {
			sourceXml: dataSetReportedAndLogged,
			deleted: { tagName: 'DataSet', id: 'ds7' },
			expectedQueries: [
				'//default:ReportControl[@name="RC"][@confRev="10003"]',
				'//default:LogControl[@name="LC"][@logName="L1"]',
			],
			unexpectedQueries: ['//default:DataSet', '//default:*[@datSet]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteIt(tx) {
			await tx.delete(testCase.deleted)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
