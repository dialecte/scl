import { assembleReport } from './diff'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DiffNode, ReportInstance } from './diff.types'
import type { ReportMapping } from '@/v2019C1/extensions/lifecycle/mapping'
import type { SclTest } from '@/v2019C1/test'

const projectRole = { tagName: 'AllocationRole', id: 'role-t' } as const

const unchangedApplication: DiffNode = { change: 'unchanged', tagName: 'Application', children: [] }

function reportedMapping(overrides: Partial<ReportMapping>): ReportMapping {
	return {
		id: 'role-s',
		tagName: 'AllocationRole',
		kind: 'shared',
		mapping: { existing: projectRole },
		reason: 'lineage',
		ambiguous: false,
		selectable: true,
		locked: true,
		candidates: [{ ref: projectRole, title: 'HMI_PC', path: 'S1/HMI_PC' }],
		...overrides,
	}
}

function reportedInstance(mappings: ReportMapping[]): ReportInstance {
	return {
		title: 'HMI',
		linked: true,
		upToDate: true,
		tree: unchangedApplication,
		groups: [],
		mappings,
	}
}

const carriedByTheInstance = reportedMapping({})
const stillToDecide = reportedMapping({
	mapping: { create: { name: 'HMI_PC_1' } },
	reason: 'none',
	locked: false,
})

describe('assembleReport — the mappings of the report', () => {
	type TestCase = SclTest.BaseTestCase & {
		/** The mappings of each reported instance. */
		instanceMappings: ReportMapping[][]
		expected: ReportMapping[]
	}

	const testCases: Record<string, TestCase> = {
		'two instances carry the mapping of one source element → listed once': {
			instanceMappings: [[carriedByTheInstance], [carriedByTheInstance]],
			expected: [carriedByTheInstance],
		},
		'one instance carries the mapping, another has yet to be given one → the one to decide is listed, whatever the order':
			{
				instanceMappings: [[carriedByTheInstance], [stillToDecide]],
				expected: [stillToDecide],
			},
		'… and in the other order': {
			instanceMappings: [[stillToDecide], [carriedByTheInstance]],
			expected: [stillToDecide],
		},
	}

	runSclTestCases.generic(testCases, (testCase) => {
		const instances = testCase.instanceMappings.map(reportedInstance)
		const report = assembleReport({ instances, templateRoots: instances })

		expect(report.mappings).toEqual(testCase.expected)
	})
})
