import {
	buildScd,
	controlRef,
	REFS,
	sourceRef,
	xcbrWithExtCtrl,
	xcbrWithExtRef,
} from '../query/__tests__/dataflow-fixture'
import { unlink } from './unlink'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	signal?: Scl.Ref<'SourceRef' | 'ControlRef'>
}

describe('unlink', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'SourceRef linked to an ExtRef → extRefUuid and extRefAddr gone': {
			sourceXml: buildScd({
				signals: sourceRef('extRefUuid="uuid-ext-ref" extRefAddr="Trip"'),
				receiverLogicalNodes: xcbrWithExtRef('uuid="uuid-ext-ref" intAddr="Trip"'),
			}),
			expectedQueries: ['//v2019C1:SourceRef[@input="Trip"]'],
			unexpectedQueries: ['//v2019C1:SourceRef[@extRefUuid]', '//v2019C1:SourceRef[@extRefAddr]'],
		},
		'ControlRef linked to an ExtCtrl → extCtrlUuid and extCtrlAddr gone': {
			sourceXml: buildScd({
				signals: controlRef('extCtrlUuid="uuid-ext-ctrl" extCtrlAddr="Close"'),
				receiverLogicalNodes: xcbrWithExtCtrl('uuid="uuid-ext-ctrl" intAddr="Close"'),
			}),
			signal: REFS.controlRef,
			expectedQueries: ['//v2019C1:ControlRef[@output="Close"]'],
			unexpectedQueries: [
				'//v2019C1:ControlRef[@extCtrlUuid]',
				'//v2019C1:ControlRef[@extCtrlAddr]',
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction(async (tx) => {
				await unlink(tx, { signal: testCase.signal ?? REFS.sourceRef })
			})
			return { assertOn: 'source' }
		},
	})
})
