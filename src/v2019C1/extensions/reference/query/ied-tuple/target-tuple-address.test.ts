import { targetTupleAddress } from './target-tuple-address'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { AnyRawRecord } from '@dialecte/core'

const ied = createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'P1' } } })
const accessPoint = createSclTestRecord({
	record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } },
})
const server = createSclTestRecord({ record: { tagName: 'Server' } })
const lDevice = createSclTestRecord({ record: { tagName: 'LDevice', attributes: { inst: 'LD0' } } })
const ln0 = createSclTestRecord({
	record: { tagName: 'LN0', attributes: { lnClass: 'LLN0', inst: '', lnType: 'LLN0_T' } },
})
const breaker = createSclTestRecord({
	record: {
		tagName: 'LN',
		attributes: { prefix: 'Q0', lnClass: 'XCBR', inst: '2', lnType: 'XCBR_T' },
	},
})

describe('targetTupleAddress', () => {
	type TestCase = { record: AnyRawRecord; ancestry: AnyRawRecord[]; expected: string | undefined }

	const testCases: Record<string, TestCase> = {
		'LN in an LDevice of an IED -> ln: IED / LD / prefix class instance': {
			record: breaker,
			ancestry: [ied, accessPoint, server, lDevice],
			expected: 'ln:P1/LD0/Q0XCBR2',
		},
		'LN0 of an LDevice -> ln: IED / LD / LLN0': {
			record: ln0,
			ancestry: [ied, accessPoint, server, lDevice],
			expected: 'ln:P1/LD0/LLN0',
		},
		'LDevice of an IED -> ld: IED / LD': {
			record: lDevice,
			ancestry: [ied, accessPoint, server],
			expected: 'ld:P1/LD0',
		},
		'AccessPoint of an IED -> ap: IED / access point name': {
			record: accessPoint,
			ancestry: [ied],
			expected: 'ap:P1/AP1',
		},
		'GSE control block in the LN0 -> cb: IED / LD / LLN0 . name': {
			record: createSclTestRecord({
				record: {
					tagName: 'GSEControl',
					attributes: { name: 'gcb1', appID: 'gcb1', datSet: 'ds1' },
				},
			}),
			ancestry: [ied, accessPoint, server, lDevice, ln0],
			expected: 'cb:P1/LD0/LLN0.gcb1',
		},
		'report control block in an LN -> cb: IED / LD / LN . name': {
			record: createSclTestRecord({
				record: { tagName: 'ReportControl', attributes: { name: 'rcb1', confRev: '1' } },
			}),
			ancestry: [ied, accessPoint, server, lDevice, breaker],
			expected: 'cb:P1/LD0/Q0XCBR2.rcb1',
		},
		'an element no tuple names (a DataSet) -> none': {
			record: createSclTestRecord({ record: { tagName: 'DataSet', attributes: { name: 'ds1' } } }),
			ancestry: [ied, accessPoint, server, lDevice, ln0],
			expected: undefined,
		},
		'an IED itself -> none (named by its name, not a tuple)': {
			record: ied,
			ancestry: [],
			expected: undefined,
		},
	}

	it.each(Object.entries(testCases))('%s', (_, testCase) => {
		expect(targetTupleAddress({ record: testCase.record, ancestry: testCase.ancestry })).toBe(
			testCase.expected,
		)
	})
})
