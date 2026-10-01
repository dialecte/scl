import {
	MIN_REQUESTED_SCD_CONNECTED_AP_TRIGGER_TAGS,
	MIN_REQUESTED_SCD_FILE_USER_ATTRIBUTES,
	MIN_REQUESTED_SCD_IED_TRIGGER_TAGS,
	MIN_REQUESTED_SCD_SUBNETWORK_TRIGGER_TAGS,
} from './min-requested-scd-file'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

describe('MinRequestedSCDFile constants', () => {
	type TestCase = SclTest.BaseTestCase & {
		tags: ReadonlySet<string> | readonly string[]
		expected: string[]
	}

	const testCases: Record<string, TestCase> = {
		'IED roots → expanded to their schema descendants, descriptive tags left out': {
			tags: MIN_REQUESTED_SCD_IED_TRIGGER_TAGS,
			expected: [
				'ClientLN',
				'DAI',
				'DataSet',
				'ExtRef',
				'FCDA',
				'GSEControl',
				'IEDName',
				'LogControl',
				'OptFields',
				'Protocol',
				'ReportControl',
				'RptEnabled',
				'SampledValueControl',
				'SettingControl',
				'SmvOpts',
				'TrgOps',
				'Val',
			],
		},
		'ConnectedAP → itself and its schema descendants, descriptive tags left out': {
			tags: MIN_REQUESTED_SCD_CONNECTED_AP_TRIGGER_TAGS,
			expected: ['Address', 'ConnectedAP', 'GSE', 'MaxTime', 'MinTime', 'P', 'SMV'],
		},
		'SubNetwork → its own settings, without the ConnectedAP subtree': {
			tags: MIN_REQUESTED_SCD_SUBNETWORK_TRIGGER_TAGS,
			expected: [
				'BitRate',
				'CommunicationServiceSpecifications',
				'GooseParameters',
				'L2CommParameters',
				'L3IPv4CommParameters',
				'L3IPv6CommParameters',
				'ReportParameters',
				'SMVParameters',
				'SubNetwork',
			],
		},
		'entry attributes → hand-set ones are all but the identity and the required ones': {
			tags: MIN_REQUESTED_SCD_FILE_USER_ATTRIBUTES,
			expected: ['desc', 'fileName', 'when'],
		},
	}

	function act(testCase: TestCase) {
		expect([...testCase.tags].sort()).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
