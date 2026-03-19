import { buildElementPath, getPathSegment } from './path-segment'

import { describe, it, expect } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/helpers'

import type { AnyRawRecord } from '@dialecte/core'

describe('getPathSegment', () => {
	type TestCase = {
		record: AnyRawRecord
		expected: { segment: string; separator: '/' | '.' } | null
	}

	const testCases: Record<string, TestCase> = {
		// Transparent elements
		'AccessPoint element → no path segment': {
			record: createSclTestRecord({
				record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } },
			}),
			expected: null,
		},
		'Server element → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'Server' } }),
			expected: null,
		},

		// IED section
		'LDevice with inst → inst as path segment': {
			record: createSclTestRecord({ record: { tagName: 'LDevice', attributes: { inst: 'LD0' } } }),
			expected: { segment: 'LD0', separator: '/' },
		},
		'LDevice without inst → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'LDevice' } }),
			expected: null,
		},
		'ExtRef with intAddr → intAddr as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'ExtRef', attributes: { intAddr: 'TrCmd.stVal' } },
			}),
			expected: { segment: 'TrCmd.stVal', separator: '.' },
		},
		'ExtRef without intAddr → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'ExtRef' } }),
			expected: null,
		},
		'ExtCtrl with intAddr → intAddr as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'ExtCtrl', attributes: { intAddr: 'Pos' } },
			}),
			expected: { segment: 'Pos', separator: '.' },
		},
		'ExtCtrl without intAddr → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'ExtCtrl' } }),
			expected: null,
		},

		// Process section
		'SourceRef with input → input as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'SourceRef', attributes: { input: 'Trip' } },
			}),
			expected: { segment: 'Trip', separator: '.' },
		},
		'SourceRef without input → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'SourceRef' } }),
			expected: null,
		},
		'ControlRef with output → output as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'ControlRef', attributes: { output: 'TripCmd' } },
			}),
			expected: { segment: 'TripCmd', separator: '.' },
		},
		'ControlRef without output → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'ControlRef' } }),
			expected: null,
		},

		// Named elements
		'Substation with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'Substation', attributes: { name: 'S1' } },
			}),
			expected: { segment: 'S1', separator: '/' },
		},
		'VoltageLevel with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'VoltageLevel', attributes: { name: 'V1' } },
			}),
			expected: { segment: 'V1', separator: '/' },
		},
		'Bay with name → name as path segment': {
			record: createSclTestRecord({ record: { tagName: 'Bay', attributes: { name: 'B1' } } }),
			expected: { segment: 'B1', separator: '/' },
		},
		'Function with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'Function', attributes: { name: 'Protection' } },
			}),
			expected: { segment: 'Protection', separator: '/' },
		},
		'SubFunction with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'SubFunction', attributes: { name: 'Trip' } },
			}),
			expected: { segment: 'Trip', separator: '/' },
		},
		'IED with name → name as path segment': {
			record: createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'IED1' } } }),
			expected: { segment: 'IED1', separator: '/' },
		},

		// Logical node composite identifier
		'LNode with prefix → prefix+lnClass+lnInst as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'LNode', attributes: { prefix: 'P', lnClass: 'XCBR', lnInst: '1' } },
			}),
			expected: { segment: 'PXCBR1', separator: '/' },
		},
		'LNode without prefix → lnClass+lnInst as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'LNode', attributes: { lnClass: 'XCBR', lnInst: '1' } },
			}),
			expected: { segment: 'XCBR1', separator: '/' },
		},
		'LN with empty prefix → lnClass+inst as path segment': {
			record: createSclTestRecord({
				record: {
					tagName: 'LN',
					attributes: { prefix: '', lnClass: 'XCBR', inst: '1', lnType: '' },
				},
			}),
			expected: { segment: 'XCBR1', separator: '/' },
		},
		'LN with prefix → prefix+lnClass+inst as path segment': {
			record: createSclTestRecord({
				record: {
					tagName: 'LN',
					attributes: { prefix: 'I01A', lnClass: 'TCTR', inst: '1', lnType: '' },
				},
			}),
			expected: { segment: 'I01ATCTR1', separator: '/' },
		},
		'LN0 with empty inst → lnClass as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'LN0', attributes: { lnClass: 'LLN0', inst: '', lnType: '' } },
			}),
			expected: { segment: 'LLN0', separator: '/' },
		},
		'LNode with only lnClass and no inst → lnClass as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'LNode', attributes: { lnClass: 'LLN0' } },
			}),
			expected: { segment: 'LLN0', separator: '/' },
		},
		'LNode with prefix, lnClass and lnInst → all three concatenated': {
			record: createSclTestRecord({
				record: { tagName: 'LNode', attributes: { prefix: 'Q0', lnClass: 'CSWI', lnInst: '1' } },
			}),
			expected: { segment: 'Q0CSWI1', separator: '/' },
		},
		'Function with empty name → no path segment': {
			record: createSclTestRecord({
				record: { tagName: 'Function', attributes: { name: '' } },
			}),
			expected: null,
		},

		// Elements with no registered extractor
		'Private element → no path segment': {
			record: createSclTestRecord({
				record: { tagName: 'Private', attributes: { type: 'eIEC61850-6-100' } },
			}),
			expected: null,
		},
		'SCL element → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'SCL' } }),
			expected: null,
		},
		'ProcessResources element → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'ProcessResources' } }),
			expected: null,
		},
	}

	Object.entries(testCases).forEach(([desc, tc]) => {
		it(desc, () => {
			expect(getPathSegment(tc.record)).toEqual(tc.expected)
		})
	})
})

describe('buildElementPath', () => {
	type TestCase = {
		record: AnyRawRecord
		ancestry: AnyRawRecord[]
		expected: string | null
	}

	const testCases: Record<string, TestCase> = {
		// Process section
		'LNode in Substation/VoltageLevel/Bay hierarchy → all named ancestor segments joined': {
			record: createSclTestRecord({
				record: { tagName: 'LNode', attributes: { lnClass: 'XCBR', lnInst: '1' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'Substation', attributes: { name: 'S1' } } }),
				createSclTestRecord({ record: { tagName: 'VoltageLevel', attributes: { name: 'V1' } } }),
				createSclTestRecord({ record: { tagName: 'Bay', attributes: { name: 'B1' } } }),
			],
			expected: 'S1/V1/B1/XCBR1',
		},
		'SourceRef with input inside LNode in hierarchy → LNode segment then dot-separated input': {
			record: createSclTestRecord({
				record: { tagName: 'SourceRef', attributes: { input: 'Trip' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'Substation', attributes: { name: 'S1' } } }),
				createSclTestRecord({ record: { tagName: 'Bay', attributes: { name: 'B1' } } }),
				createSclTestRecord({
					record: { tagName: 'LNode', attributes: { lnClass: 'XCBR', lnInst: '1' } },
				}),
				createSclTestRecord({
					record: { tagName: 'Private', attributes: { type: 'eIEC61850-6-100' } },
				}),
			],
			expected: 'S1/B1/XCBR1.Trip',
		},
		'ControlRef with output inside LNode in hierarchy → LNode segment then dot-separated output': {
			record: createSclTestRecord({
				record: { tagName: 'ControlRef', attributes: { output: 'TripCmd' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'Substation', attributes: { name: 'S1' } } }),
				createSclTestRecord({ record: { tagName: 'Bay', attributes: { name: 'B1' } } }),
				createSclTestRecord({
					record: { tagName: 'LNode', attributes: { lnClass: 'XCBR', lnInst: '1' } },
				}),
				createSclTestRecord({
					record: { tagName: 'Private', attributes: { type: 'eIEC61850-6-100' } },
				}),
			],
			expected: 'S1/B1/XCBR1.TripCmd',
		},
		'Function directly under Substation → Substation and Function names joined in path': {
			record: createSclTestRecord({
				record: { tagName: 'Function', attributes: { name: 'Protection' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'Substation', attributes: { name: 'S1' } } }),
			],
			expected: 'S1/Protection',
		},
		'SubFunction under Function in hierarchy → all named ancestors included in path': {
			record: createSclTestRecord({
				record: { tagName: 'SubFunction', attributes: { name: 'Trip' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'Substation', attributes: { name: 'S1' } } }),
				createSclTestRecord({ record: { tagName: 'VoltageLevel', attributes: { name: 'V1' } } }),
				createSclTestRecord({ record: { tagName: 'Function', attributes: { name: 'Prot' } } }),
			],
			expected: 'S1/V1/Prot/Trip',
		},
		'SubFunction nested under existing SubFunction → all levels of nesting included in path': {
			record: createSclTestRecord({
				record: { tagName: 'SubFunction', attributes: { name: 'SubTrip' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'Substation', attributes: { name: 'S1' } } }),
				createSclTestRecord({ record: { tagName: 'VoltageLevel', attributes: { name: 'V1' } } }),
				createSclTestRecord({ record: { tagName: 'Function', attributes: { name: 'Prot' } } }),
				createSclTestRecord({ record: { tagName: 'SubFunction', attributes: { name: 'Trip' } } }),
			],
			expected: 'S1/V1/Prot/Trip/SubTrip',
		},

		// IED section
		'LN inside LDevice with transparent AccessPoint and Server in ancestry → transparent containers excluded from path':
			{
				record: createSclTestRecord({
					record: {
						tagName: 'LN',
						attributes: { prefix: '', lnClass: 'XCBR', inst: '1', lnType: '' },
					},
				}),
				ancestry: [
					createSclTestRecord({ record: { tagName: 'SCL' } }),
					createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'IED1' } } }),
					createSclTestRecord({ record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } } }),
					createSclTestRecord({ record: { tagName: 'Server' } }),
					createSclTestRecord({ record: { tagName: 'LDevice', attributes: { inst: 'LD0' } } }),
				],
				expected: 'IED1/LD0/XCBR1',
			},
		'ExtRef with intAddr inside LN in IED hierarchy → full IED path with dot-separated intAddr': {
			record: createSclTestRecord({
				record: { tagName: 'ExtRef', attributes: { intAddr: 'TrCmd.stVal' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'IED1' } } }),
				createSclTestRecord({ record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } } }),
				createSclTestRecord({ record: { tagName: 'Server' } }),
				createSclTestRecord({ record: { tagName: 'LDevice', attributes: { inst: 'LD0' } } }),
				createSclTestRecord({
					record: {
						tagName: 'LN',
						attributes: { prefix: '', lnClass: 'XCBR', inst: '1', lnType: '' },
					},
				}),
			],
			expected: 'IED1/LD0/XCBR1.TrCmd.stVal',
		},
		'ExtCtrl with intAddr inside LN in IED hierarchy → full IED path with dot-separated intAddr': {
			record: createSclTestRecord({
				record: { tagName: 'ExtCtrl', attributes: { intAddr: 'Pos' } },
			}),
			ancestry: [
				createSclTestRecord({ record: { tagName: 'SCL' } }),
				createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'IED1' } } }),
				createSclTestRecord({ record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } } }),
				createSclTestRecord({ record: { tagName: 'Server' } }),
				createSclTestRecord({ record: { tagName: 'LDevice', attributes: { inst: 'LD0' } } }),
				createSclTestRecord({
					record: {
						tagName: 'LN',
						attributes: { prefix: '', lnClass: 'XCBR', inst: '1', lnType: '' },
					},
				}),
			],
			expected: 'IED1/LD0/XCBR1.Pos',
		},
		'LN with prefix inside LDevice in IED hierarchy → prefix concatenated with lnClass and inst in segment':
			{
				record: createSclTestRecord({
					record: {
						tagName: 'LN',
						attributes: { prefix: 'I01A', lnClass: 'TCTR', inst: '1', lnType: '' },
					},
				}),
				ancestry: [
					createSclTestRecord({ record: { tagName: 'SCL' } }),
					createSclTestRecord({ record: { tagName: 'IED', attributes: { name: 'PIU' } } }),
					createSclTestRecord({ record: { tagName: 'AccessPoint', attributes: { name: 'AP1' } } }),
					createSclTestRecord({ record: { tagName: 'Server' } }),
					createSclTestRecord({
						record: { tagName: 'LDevice', attributes: { inst: 'CT_Function' } },
					}),
				],
				expected: 'PIU/CT_Function/I01ATCTR1',
			},

		// Edge cases
		'element with no registered extractor and no named ancestors → no path': {
			record: createSclTestRecord({
				record: { tagName: 'Private', attributes: { type: 'eIEC61850-6-100' } },
			}),
			ancestry: [createSclTestRecord({ record: { tagName: 'SCL' } })],
			expected: null,
		},
		'ProcessResource inside ProcessResources container in hierarchy → container element excluded from path':
			{
				record: createSclTestRecord({
					record: { tagName: 'ProcessResource', attributes: { name: 'PR1' } },
				}),
				ancestry: [
					createSclTestRecord({ record: { tagName: 'SCL' } }),
					createSclTestRecord({ record: { tagName: 'Substation', attributes: { name: 'S1' } } }),
					createSclTestRecord({ record: { tagName: 'Bay', attributes: { name: 'B1' } } }),
					createSclTestRecord({
						record: { tagName: 'Private', attributes: { type: 'eIEC61850-6-100' } },
					}),
					createSclTestRecord({ record: { tagName: 'ProcessResources' } }),
				],
				expected: 'S1/B1/PR1',
			},
	}

	Object.entries(testCases).forEach(([description, testCase]) => {
		it(description, () => {
			expect(buildElementPath({ record: testCase.record, ancestry: testCase.ancestry })).toBe(
				testCase.expected,
			)
		})
	})
})
