import { getPathSegment } from './path-segment'

import { describe, it, expect } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

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
		'SourceRef with inputInst != 1 → appends (inputInst)': {
			record: createSclTestRecord({
				record: { tagName: 'SourceRef', attributes: { input: 'Trip', inputInst: '2' } },
			}),
			expected: { segment: 'Trip(2)', separator: '.' },
		},
		'SourceRef with pDA → appends .pDA': {
			record: createSclTestRecord({
				record: { tagName: 'SourceRef', attributes: { input: 'Trip', pDA: 'general' } },
			}),
			expected: { segment: 'Trip.general', separator: '.' },
		},
		'SourceRef with inputInst != 1 and pDA → appends (inputInst).pDA': {
			record: createSclTestRecord({
				record: {
					tagName: 'SourceRef',
					attributes: { input: 'Trip', inputInst: '2', pDA: 'general' },
				},
			}),
			expected: { segment: 'Trip(2).general', separator: '.' },
		},
		'SourceRef with inputInst=1 (default) → no suffix': {
			record: createSclTestRecord({
				record: { tagName: 'SourceRef', attributes: { input: 'Trip', inputInst: '1' } },
			}),
			expected: { segment: 'Trip', separator: '.' },
		},
		'SourceRef with inputInst=1 and pDA → appends .pDA only': {
			record: createSclTestRecord({
				record: {
					tagName: 'SourceRef',
					attributes: { input: 'Trip', inputInst: '1', pDA: 'general' },
				},
			}),
			expected: { segment: 'Trip.general', separator: '.' },
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
		'ControlRef with outputInst != 1 → appends (outputInst)': {
			record: createSclTestRecord({
				record: { tagName: 'ControlRef', attributes: { output: 'TripCmd', outputInst: '2' } },
			}),
			expected: { segment: 'TripCmd(2)', separator: '.' },
		},
		'ControlRef with outputInst=1 (default) → no suffix': {
			record: createSclTestRecord({
				record: { tagName: 'ControlRef', attributes: { output: 'TripCmd', outputInst: '1' } },
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
		'PowerSystemRelation with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'PowerSystemRelation', attributes: { name: 'PSR1' } },
			}),
			expected: { segment: 'PSR1', separator: '/' },
		},
		'PowerSystemRelation without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'PowerSystemRelation' } }),
			expected: null,
		},

		// Transparent containers
		'Private element → no path segment': {
			record: createSclTestRecord({
				record: { tagName: 'Private', attributes: { type: 'eIEC61850-6-100' } },
			}),
			expected: null,
		},
		'LNodeInputs element → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'LNodeInputs' } }),
			expected: null,
		},
		'LNodeOutputs element → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'LNodeOutputs' } }),
			expected: null,
		},

		// Data specifications (6-100, dot-separated)
		'DOS with name → name as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'DOS', attributes: { name: 'Tr' } },
			}),
			expected: { segment: 'Tr', separator: '.' },
		},
		'DOS without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'DOS' } }),
			expected: null,
		},
		'DAS with name → name as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'DAS', attributes: { name: 'general' } },
			}),
			expected: { segment: 'general', separator: '.' },
		},
		'DAS without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'DAS' } }),
			expected: null,
		},
		'SDS with name → name as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'SDS', attributes: { name: 'q' } },
			}),
			expected: { segment: 'q', separator: '.' },
		},
		'SDS without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'SDS' } }),
			expected: null,
		},

		// Data instances (IED side, dot-separated)
		'DOI with name → name as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'DOI', attributes: { name: 'Pos' } },
			}),
			expected: { segment: 'Pos', separator: '.' },
		},
		'DOI without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'DOI' } }),
			expected: null,
		},
		'SDI with name → name as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'SDI', attributes: { name: 'origin' } },
			}),
			expected: { segment: 'origin', separator: '.' },
		},
		'SDI without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'SDI' } }),
			expected: null,
		},
		'DAI with name → name as dot-separated segment': {
			record: createSclTestRecord({
				record: { tagName: 'DAI', attributes: { name: 'ctlVal' } },
			}),
			expected: { segment: 'ctlVal', separator: '.' },
		},
		'DAI without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'DAI' } }),
			expected: null,
		},

		// Structural elements (slash-separated)
		'Line with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'Line', attributes: { name: 'L1' } },
			}),
			expected: { segment: 'L1', separator: '/' },
		},
		'Line without name → no path segment': {
			record: createSclTestRecord({ record: { tagName: 'Line' } }),
			expected: null,
		},
		'ConnectivityNode with name → name as path segment': {
			record: createSclTestRecord({
				record: {
					tagName: 'ConnectivityNode',
					attributes: { name: 'CN1', pathName: 'S1/V1/B1/CN1' },
				},
			}),
			expected: { segment: 'CN1', separator: '/' },
		},
		'TapChanger with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'TapChanger', attributes: { name: 'TC1', type: 'LTC' } },
			}),
			expected: { segment: 'TC1', separator: '/' },
		},
		'FunctionTemplate with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'FunctionTemplate', attributes: { name: 'FT1' } },
			}),
			expected: { segment: 'FT1', separator: '/' },
		},
		'SubFunctionTemplate with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'SubFunctionTemplate', attributes: { name: 'SFT1' } },
			}),
			expected: { segment: 'SFT1', separator: '/' },
		},
		'Application with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'Application', attributes: { name: 'App1' } },
			}),
			expected: { segment: 'App1', separator: '/' },
		},
		'FunctionalVariantGroup with name → name as path segment': {
			record: createSclTestRecord({
				record: { tagName: 'FunctionalVariantGroup', attributes: { name: 'FVG1' } },
			}),
			expected: { segment: 'FVG1', separator: '/' },
		},

		// Elements with no registered extractor
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
