import { visibleAttributes } from './visible-attributes'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

describe('visibleAttributes', () => {
	type TestCase = {
		only?: boolean
		tagName: string
		attributes: Record<string, string>
		/** Whose names the comparison follows. Default: the project's. */
		namesFollow?: 'project' | 'source'
		expected: Record<string, string>
	}

	const testCases: Record<string, TestCase> = {
		'Terminal → its node path, uuid and level names left out, its own attributes kept': {
			tagName: 'Terminal',
			attributes: {
				name: 'T1',
				desc: 'feeder side',
				connectivityNode: 'TEMPLATE/TEMPLATE/B1/L1',
				processName: 'P1',
				lineName: 'LN1',
				substationName: 'TEMPLATE',
				voltageLevelName: 'TEMPLATE',
				bayName: 'B1',
				cNodeName: 'L1',
				cNodeUuid: '00000000-0000-4000-8000-000000000001',
			},
			expected: { desc: 'feeder side' },
		},
		'ConnectivityNode → its pathName and identity left out': {
			tagName: 'ConnectivityNode',
			attributes: {
				name: 'L1',
				desc: 'line side',
				pathName: 'TEMPLATE/TEMPLATE/B1/L1',
				uuid: '00000000-0000-4000-8000-000000000001',
			},
			expected: { desc: 'line side' },
		},
		'an element writing nothing from a path → only identity, name and references left out': {
			tagName: 'Bay',
			attributes: { name: 'B1', desc: 'feeder', uuid: '00000000-0000-4000-8000-000000000003' },
			expected: { desc: 'feeder' },
		},
		'LNode → its type reference left out, compared by the type it names': {
			tagName: 'LNode',
			attributes: {
				iedName: 'None',
				lnClass: 'CSWI',
				lnInst: '1',
				lnType: 'CSWI_Type',
				desc: 'controller',
			},
			// `iedName="None"` is its schema default: the same as no iedName
			expected: { lnClass: 'CSWI', lnInst: '1', desc: 'controller' },
		},
		'LNode with an empty lnInst, its schema default → left out, as an absent lnInst': {
			tagName: 'LNode',
			attributes: { iedName: 'P1', lnClass: 'LLN0', lnInst: '' },
			expected: { iedName: 'P1', lnClass: 'LLN0' },
		},
		'an empty desc, its schema default → left out, as an absent desc': {
			tagName: 'Bay',
			attributes: { name: 'B1', desc: '' },
			expected: {},
		},
		'names following the source → the name compared too': {
			tagName: 'Bay',
			attributes: { name: 'B1', desc: 'feeder', uuid: '00000000-0000-4000-8000-000000000003' },
			namesFollow: 'source',
			expected: { name: 'B1', desc: 'feeder' },
		},
		'names following the source → a terminal still leaves out the names it writes from a path': {
			tagName: 'Terminal',
			attributes: { name: 'T1', cNodeName: 'L1', bayName: 'B1' },
			namesFollow: 'source',
			expected: { name: 'T1' },
		},
	}

	function act(testCase: TestCase): void {
		const visible = visibleAttributes({
			record: { tagName: testCase.tagName, parent: null, attributes: [] },
			attributes: testCase.attributes,
			namesFollow: testCase.namesFollow ?? 'project',
		})
		expect(visible).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
