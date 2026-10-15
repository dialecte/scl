import { composeDerivedAttributes, derivedAttributesFollowing } from './compose-derived-attributes'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ElementPath } from './path-segment.types'
import type { DerivedAttributeValue } from '@/v2019C1/extensions/reference'

describe('composeDerivedAttributes', () => {
	type TestCase = {
		only?: boolean
		tagName: string
		follows: string
		levels: [tagName: string, name: string][]
		expected: DerivedAttributeValue[]
	}

	const testCases: Record<string, TestCase> = {
		'terminal, node in a Bay → substation, voltage level, bay and node names, no process nor line':
			{
				tagName: 'Terminal',
				follows: 'connectivityNode',
				levels: [
					['Substation', 'S1'],
					['VoltageLevel', 'VL1'],
					['Bay', 'B1'],
					['ConnectivityNode', 'L1'],
				],
				expected: [
					{ name: 'processName', value: undefined },
					{ name: 'lineName', value: undefined },
					{ name: 'substationName', value: 'S1' },
					{ name: 'voltageLevelName', value: 'VL1' },
					{ name: 'bayName', value: 'B1' },
					{ name: 'cNodeName', value: 'L1' },
				],
			},
		'neutral point, node in a Line of a Process (a three-level path) → process, line and node names':
			{
				tagName: 'NeutralPoint',
				follows: 'connectivityNode',
				levels: [
					['Process', 'P1'],
					['Line', 'LN1'],
					['ConnectivityNode', 'N1'],
				],
				expected: [
					{ name: 'processName', value: 'P1' },
					{ name: 'lineName', value: 'LN1' },
					{ name: 'substationName', value: undefined },
					{ name: 'voltageLevelName', value: undefined },
					{ name: 'bayName', value: undefined },
					{ name: 'cNodeName', value: 'N1' },
				],
			},
		'terminal, node in a Bay of nested Processes → process names joined with "/"': {
			tagName: 'Terminal',
			follows: 'connectivityNode',
			levels: [
				['Process', 'P1'],
				['Process', 'P2'],
				['Substation', 'S1'],
				['VoltageLevel', 'VL1'],
				['Bay', 'B1'],
				['ConnectivityNode', 'L1'],
			],
			expected: [
				{ name: 'processName', value: 'P1/P2' },
				{ name: 'lineName', value: undefined },
				{ name: 'substationName', value: 'S1' },
				{ name: 'voltageLevelName', value: 'VL1' },
				{ name: 'bayName', value: 'B1' },
				{ name: 'cNodeName', value: 'L1' },
			],
		},
		'connectivity node, its own path → pathName': {
			tagName: 'ConnectivityNode',
			follows: 'self',
			levels: [
				['Line', 'LN1'],
				['ConnectivityNode', 'N1'],
			],
			expected: [{ name: 'pathName', value: 'LN1/N1' }],
		},
	}

	function act(testCase: TestCase): void {
		const derived = derivedAttributesFollowing({
			tagName: testCase.tagName,
			follows: testCase.follows,
		})
		if (!derived) throw new Error(`no derived attributes for ${testCase.tagName}`)
		const sourcePath = pathOf(testCase.levels)
		expect(composeDerivedAttributes({ derived, sourcePath })).toEqual(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})

function pathOf(levels: [tagName: string, name: string][]): ElementPath {
	const segments = levels.map(([tagName, name], index) => ({
		segment: name,
		separator: '/' as const,
		ref: { tagName, id: `level-${index}` },
	}))
	return { path: segments.map((segment) => segment.segment).join('/'), segments }
}
