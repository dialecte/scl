import { assertMappingsCoherent } from './assert-mappings-coherent'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DecisionMapping, ReportMapping } from './mapping.types'
import type { SclTest } from '@/v2019C1/test'

const projectRole = { tagName: 'AllocationRole', id: 'role-t' } as const
const otherProjectRole = { tagName: 'AllocationRole', id: 'gateway-t' } as const

function reportedMapping(overrides: Partial<ReportMapping> = {}): ReportMapping {
	return {
		id: 'role-s',
		tagName: 'AllocationRole',
		mapping: { existing: projectRole },
		reason: 'name',
		ambiguous: false,
		selectable: true,
		candidates: [
			{ ref: otherProjectRole, title: 'Gateway', path: 'S1/Gateway' },
			{ ref: projectRole, title: 'HMI_PC', path: 'S1/HMI_PC' },
		],
		...overrides,
	}
}

function captureErrorMessage(run: () => void): string {
	try {
		run()
	} catch (error) {
		return (error as Error).message
	}
	return ''
}

describe('assertMappingsCoherent', () => {
	type TestCase = SclTest.BaseTestCase & {
		mappings: ReportMapping[]
		chosen: [string, DecisionMapping][]
		/** A fragment of the rejection — empty when the choices are accepted. */
		expectedRejection: string
	}

	const testCases: Record<string, TestCase> = {
		'a choice for an element the report does not list → rejected, naming it': {
			mappings: [reportedMapping()],
			chosen: [['unknown-s', { create: {} }]],
			expectedRejection: 'no shared element "unknown-s"',
		},
		'a project element that is not among the candidates → rejected, naming it': {
			mappings: [reportedMapping()],
			chosen: [['role-s', { existing: { tagName: 'Bay', id: 'bay-t' } }]],
			expectedRejection: '<Bay> "bay-t" is not a candidate',
		},
		"a choice for an element whose mapping is not the consumer's to change → rejected": {
			mappings: [reportedMapping({ selectable: false })],
			chosen: [['role-s', { create: {} }]],
			expectedRejection: 'cannot be chosen',
		},
		'no choice → accepted': {
			mappings: [reportedMapping()],
			chosen: [],
			expectedRejection: '',
		},
		'another candidate of the project → accepted': {
			mappings: [reportedMapping()],
			chosen: [['role-s', { existing: otherProjectRole }]],
			expectedRejection: '',
		},
		'a new element, named or not → accepted': {
			mappings: [reportedMapping()],
			chosen: [['role-s', { create: { name: 'HMI_Bay7' } }]],
			expectedRejection: '',
		},
	}

	function act(testCase: TestCase) {
		const message = captureErrorMessage(() =>
			assertMappingsCoherent({
				mappings: testCase.mappings,
				decisionMappings: new Map(testCase.chosen),
			}),
		)
		if (testCase.expectedRejection === '') expect(message).toBe('')
		else expect(message).toContain(testCase.expectedRejection)
	}

	runSclTestCases.generic(testCases, act)
})
