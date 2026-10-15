import { referrerTupleAddress } from './referrer-tuple-address'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

const ied = createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'P1' } } })
const accessPoint = createSclTestRecord({
	record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } },
})
const lDevice = createSclTestRecord({ record: { tagName: 'LDevice', attributes: { inst: 'LD0' } } })
const ln0 = createSclTestRecord({
	record: { tagName: 'LN0', attributes: { lnClass: 'LLN0', inst: '', lnType: 'LLN0_T' } },
})
const dataSet = createSclTestRecord({ record: { tagName: 'DataSet', attributes: { name: 'ds1' } } })
const connectedAP = createSclTestRecord({
	record: { tagName: 'ConnectedAP', attributes: { iedName: 'P1', apName: 'AP1' } },
})

const accessPointOfConnectedAP: TupleReferencePair = {
	attribute: { uuid: 'apUuid' },
	target: ['AccessPoint'],
	tuple: { ied: { attribute: 'iedName' }, accessPoint: 'apName' },
}
const accessPointOfServerAt: TupleReferencePair = {
	attribute: { uuid: 'apUuid' },
	target: ['AccessPoint'],
	tuple: { ied: { ancestor: true }, accessPoint: 'apName' },
}
const logicalNodeOfExtRef: TupleReferencePair = {
	attribute: { uuid: 'lnUuid' },
	target: ['LN', 'LN0'],
	tuple: {
		ied: { attribute: 'iedName' },
		lDevice: 'ldInst',
		prefix: 'prefix',
		lnClass: 'lnClass',
		lnInst: 'lnInst',
	},
}
const controlBlockOfExtRef: TupleReferencePair = {
	attribute: { uuid: 'srcCBUuid' },
	target: ['GSEControl', 'SampledValueControl', 'ReportControl'],
	otherwise: { lDevice: 'ldInst' },
	tuple: {
		ied: { attribute: 'iedName' },
		lDevice: 'srcLDInst',
		prefix: 'srcPrefix',
		lnClass: 'srcLNClass',
		lnInst: 'srcLNInst',
		controlBlock: 'srcCBName',
	},
}
const logicalNodeOfFcda: TupleReferencePair = {
	attribute: { uuid: 'lnUuid' },
	target: ['LN', 'LN0'],
	tuple: {
		ied: { ancestor: true },
		lDevice: 'ldInst',
		prefix: 'prefix',
		lnClass: 'lnClass',
		lnInst: 'lnInst',
	},
}
const controlBlockOfGse: TupleReferencePair = {
	attribute: { uuid: 'cbUuid' },
	target: ['GSEControl'],
	tuple: { ied: { parentAttribute: 'iedName' }, lDevice: 'ldInst', controlBlock: 'cbName' },
}
const accessPointOfIedName: TupleReferencePair = {
	attribute: { uuid: 'apUuid' },
	target: ['AccessPoint'],
	tuple: { ied: { text: true }, accessPoint: 'apRef' },
	onlyWithout: ['ldInst'],
}
const logicalDeviceOfIedName: TupleReferencePair = {
	attribute: { uuid: 'ldUuid' },
	target: ['LDevice'],
	tuple: { ied: { text: true }, lDevice: 'ldInst' },
	onlyWithout: ['lnClass'],
}

describe('referrerTupleAddress', () => {
	type TestCase = {
		pair: TupleReferencePair
		record: AnyRawRecord
		ancestry: AnyRawRecord[]
		expected: string | undefined
	}

	const testCases: Record<string, TestCase> = {
		'ConnectedAP naming its IED and access point -> ap: IED / access point': {
			pair: accessPointOfConnectedAP,
			record: connectedAP,
			ancestry: [],
			expected: 'ap:P1/AP1',
		},
		'ServerAt naming an access point of its own IED -> ap: that IED / access point': {
			pair: accessPointOfServerAt,
			record: createSclTestRecord({
				record: { tagName: 'ServerAt', attributes: { apName: 'AP2' } },
			}),
			ancestry: [ied, accessPoint],
			expected: 'ap:P1/AP2',
		},
		'ExtRef bound to an LN of another IED -> ln: that IED / LD / LN': {
			pair: logicalNodeOfExtRef,
			record: createSclTestRecord({
				record: {
					tagName: 'ExtRef',
					attributes: {
						iedName: 'P2',
						ldInst: 'LD0',
						prefix: 'Q0',
						lnClass: 'XCBR',
						lnInst: '2',
						doName: 'Pos',
					},
				},
			}),
			ancestry: [ied, accessPoint, lDevice, ln0],
			expected: 'ln:P2/LD0/Q0XCBR2',
		},
		'ExtRef bound inside its own IED (iedName @) -> ln: the IED it sits in / LD / LN': {
			pair: logicalNodeOfExtRef,
			record: createSclTestRecord({
				record: {
					tagName: 'ExtRef',
					attributes: {
						iedName: '@',
						ldInst: 'LD0',
						prefix: 'Q0',
						lnClass: 'XCBR',
						lnInst: '2',
						doName: 'Pos',
					},
				},
			}),
			ancestry: [ied, accessPoint, lDevice, ln0],
			expected: 'ln:P1/LD0/Q0XCBR2',
		},
		'ExtRef naming a control block without its LD -> cb: in the LD of its data': {
			pair: controlBlockOfExtRef,
			record: createSclTestRecord({
				record: {
					tagName: 'ExtRef',
					attributes: { iedName: 'P2', ldInst: 'LD1', srcCBName: 'gcb1' },
				},
			}),
			ancestry: [ied, accessPoint, lDevice, ln0],
			expected: 'cb:P2/LD1/LLN0.gcb1',
		},
		'ExtRef not bound yet (intAddr only) -> none': {
			pair: logicalNodeOfExtRef,
			record: createSclTestRecord({
				record: { tagName: 'ExtRef', attributes: { intAddr: 'Trip.general' } },
			}),
			ancestry: [ied, accessPoint, lDevice, ln0],
			expected: undefined,
		},
		'ExtRef naming a control block without its LN -> cb: that IED / LD / LN0 . name': {
			pair: controlBlockOfExtRef,
			record: createSclTestRecord({
				record: {
					tagName: 'ExtRef',
					attributes: { iedName: 'P2', srcLDInst: 'LD0', srcCBName: 'gcb1' },
				},
			}),
			ancestry: [ied, accessPoint, lDevice, ln0],
			expected: 'cb:P2/LD0/LLN0.gcb1',
		},
		'ExtRef naming a report control block in an LN -> cb: that IED / LD / LN . name': {
			pair: controlBlockOfExtRef,
			record: createSclTestRecord({
				record: {
					tagName: 'ExtRef',
					attributes: {
						iedName: 'P2',
						srcLDInst: 'LD0',
						srcPrefix: 'Q0',
						srcLNClass: 'XCBR',
						srcLNInst: '2',
						srcCBName: 'rcb1',
					},
				},
			}),
			ancestry: [ied, accessPoint, lDevice, ln0],
			expected: 'cb:P2/LD0/Q0XCBR2.rcb1',
		},
		'FCDA naming an LN of its own IED -> ln: that IED / LD / LN': {
			pair: logicalNodeOfFcda,
			record: createSclTestRecord({
				record: {
					tagName: 'FCDA',
					attributes: {
						ldInst: 'LD0',
						prefix: 'Q0',
						lnClass: 'XCBR',
						lnInst: '2',
						doName: 'Pos',
						fc: 'ST',
					},
				},
			}),
			ancestry: [ied, accessPoint, lDevice, ln0, dataSet],
			expected: 'ln:P1/LD0/Q0XCBR2',
		},
		'GSE naming a control block, its IED named by the ConnectedAP -> cb: IED / LD / LN0 . name': {
			pair: controlBlockOfGse,
			record: createSclTestRecord({
				record: { tagName: 'GSE', attributes: { ldInst: 'LD0', cbName: 'gcb1' } },
			}),
			ancestry: [connectedAP],
			expected: 'cb:P1/LD0/LLN0.gcb1',
		},
		'IEDName naming an access point by its text -> ap: IED / access point': {
			pair: accessPointOfIedName,
			record: {
				...createSclTestRecord({ record: { tagName: 'IEDName', attributes: { apRef: 'AP1' } } }),
				value: 'P2',
			},
			ancestry: [],
			expected: 'ap:P2/AP1',
		},
		'IEDName naming a logical device -> its access point reference is not the target': {
			pair: accessPointOfIedName,
			record: {
				...createSclTestRecord({
					record: { tagName: 'IEDName', attributes: { apRef: 'AP1', ldInst: 'LD0' } },
				}),
				value: 'P2',
			},
			ancestry: [],
			expected: undefined,
		},
		'IEDName naming a logical device -> ld: IED / LD': {
			pair: logicalDeviceOfIedName,
			record: {
				...createSclTestRecord({
					record: { tagName: 'IEDName', attributes: { apRef: 'AP1', ldInst: 'LD0' } },
				}),
				value: 'P2',
			},
			ancestry: [],
			expected: 'ld:P2/LD0',
		},
	}

	it.each(Object.entries(testCases))('%s', (_, testCase) => {
		const { pair, ancestry, expected } = testCase
		expect(referrerTupleAddress({ pair, record: testCase.record, ancestry })).toBe(expected)
	})
})
