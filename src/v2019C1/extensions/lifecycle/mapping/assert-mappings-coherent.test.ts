import { assertMappingsCoherent } from './assert-mappings-coherent'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DecisionMapping, ReportMapping } from './mapping.types'
import type { SclErrorKey } from '@/v2019C1/errors'
import type { SclTest } from '@/v2019C1/test'

const projectRole = { tagName: 'AllocationRole', id: 'role-t' } as const
const otherProjectRole = { tagName: 'AllocationRole', id: 'gateway-t' } as const

function reportedMapping(overrides: Partial<ReportMapping> = {}): ReportMapping {
	return {
		id: 'role-s',
		tagName: 'AllocationRole',
		kind: 'shared',
		mapping: { existing: projectRole },
		reason: 'name',
		ambiguous: false,
		selectable: true,
		locked: false,
		candidates: [
			{ ref: otherProjectRole, title: 'Gateway', path: 'S1/Gateway' },
			{ ref: projectRole, title: 'HMI_PC', path: 'S1/HMI_PC' },
		],
		...overrides,
	}
}

/** What a refusal carries: the developer's message, and the structured error a consumer reads. */
function captureRefusal(run: () => void): { message: string; key?: string; meta?: unknown } {
	try {
		run()
	} catch (error) {
		const refusal = toDialecteError(error)
		return { message: (error as Error).message, key: refusal?.key, meta: refusal?.meta }
	}
	return { message: '' }
}

describe('assertMappingsCoherent', () => {
	type TestCase = SclTest.BaseTestCase & {
		reportMappings: ReportMapping[]
		chosen: [string, DecisionMapping][]
		/** A fragment of the rejection — empty when the choices are accepted. */
		expectedRejection: string
		/** The key the refusal is identified by, and what it says it is about. */
		expectedKey?: SclErrorKey
		expectedMeta?: Record<string, unknown>
	}

	const testCases: Record<string, TestCase> = {
		'a choice for an element the report does not list → rejected, naming it': {
			reportMappings: [reportedMapping()],
			chosen: [['unknown-s', { create: {} }]],
			expectedRejection: 'no shared element "unknown-s"',
			expectedKey: 'MAPPING_CHOICE_UNKNOWN',
			expectedMeta: { sourceId: 'unknown-s' },
		},
		'a project element that is not among the candidates → rejected, naming it': {
			reportMappings: [reportedMapping()],
			chosen: [['role-s', { existing: { tagName: 'Bay', id: 'bay-t' } }]],
			expectedRejection: '<Bay> "bay-t" is not a candidate',
			expectedKey: 'MAPPING_CHOICE_NOT_A_CANDIDATE',
			expectedMeta: {
				sourceId: 'role-s',
				tagName: 'AllocationRole',
				chosen: { tagName: 'Bay', id: 'bay-t' },
			},
		},
		"a choice for an element whose mapping is not the consumer's to change → rejected": {
			reportMappings: [reportedMapping({ selectable: false })],
			chosen: [['role-s', { create: {} }]],
			expectedRejection: 'cannot be chosen',
			expectedKey: 'MAPPING_CHOICE_NOT_SELECTABLE',
			expectedMeta: { sourceId: 'role-s', tagName: 'AllocationRole' },
		},
		'a choice for an element the instance being updated already carries a mapping for → rejected': {
			reportMappings: [reportedMapping({ reason: 'lineage', locked: true })],
			chosen: [['role-s', { existing: otherProjectRole }]],
			expectedRejection: 'the instance already carries the mapping',
			expectedKey: 'MAPPING_CHOICE_LOCKED',
			expectedMeta: { sourceId: 'role-s', tagName: 'AllocationRole' },
		},
		'no choice → accepted': {
			reportMappings: [reportedMapping()],
			chosen: [],
			expectedRejection: '',
		},
		'another candidate of the project → accepted': {
			reportMappings: [reportedMapping()],
			chosen: [['role-s', { existing: otherProjectRole }]],
			expectedRejection: '',
		},
		'a new element, named or not → accepted': {
			reportMappings: [reportedMapping()],
			chosen: [['role-s', { create: { name: 'HMI_Bay7' } }]],
			expectedRejection: '',
		},
	}

	function act(testCase: TestCase) {
		const refusal = captureRefusal(() =>
			assertMappingsCoherent({
				reportMappings: testCase.reportMappings,
				decisionMappings: new Map(testCase.chosen),
			}),
		)
		if (testCase.expectedRejection === '') expect(refusal.message).toBe('')
		else expect(refusal.message).toContain(testCase.expectedRejection)
		expect(refusal.key).toBe(testCase.expectedKey)
		expect(refusal.meta).toEqual(testCase.expectedMeta)
	}

	runSclTestCases.generic(testCases, act)
})
