import { classifyAttribute, editableAttributes } from './classify-attribute'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { AttributeEditability } from './classify-attribute.types'
import type { SclTest } from '@/v2019C1/test'

describe('classifyAttribute', () => {
	type TestCase = SclTest.BaseTestCase & {
		tag: string
		attr: string
		expected: AttributeEditability
	}

	const testCases: Record<string, TestCase> = {
		// lineage -> identity
		'Function.uuid -> identity': { tag: 'Function', attr: 'uuid', expected: 'identity' },
		'Function.templateUuid -> identity': {
			tag: 'Function',
			attr: 'templateUuid',
			expected: 'identity',
		},
		'AllocationRole.originUuid -> identity': {
			tag: 'AllocationRole',
			attr: 'originUuid',
			expected: 'identity',
		},
		// name -> rename (the mutable label)
		'Function.name -> rename': { tag: 'Function', attr: 'name', expected: 'rename' },
		'Bay.name -> rename': { tag: 'Bay', attr: 'name', expected: 'rename' },
		// free descriptive attrs
		'Function.desc -> free': { tag: 'Function', attr: 'desc', expected: 'free' },
		'Variable.value -> free': { tag: 'Variable', attr: 'value', expected: 'free' },
		// LNode identity tuple -> identity (delete+create, not an edit)
		'LNode.lnClass -> identity': { tag: 'LNode', attr: 'lnClass', expected: 'identity' },
		'LNode.lnInst -> identity': { tag: 'LNode', attr: 'lnInst', expected: 'identity' },
		'LNode.iedName -> identity': { tag: 'LNode', attr: 'iedName', expected: 'identity' },
		'LNode.prefix -> identity': { tag: 'LNode', attr: 'prefix', expected: 'identity' },
		// reference attrs -> reference (system-owned)
		'FunctionCatRef.function -> reference': {
			tag: 'FunctionCatRef',
			attr: 'function',
			expected: 'reference',
		},
		'FunctionCatRef.functionUuid -> reference': {
			tag: 'FunctionCatRef',
			attr: 'functionUuid',
			expected: 'reference',
		},
		'AllocationRoleRef.allocationRole -> reference': {
			tag: 'AllocationRoleRef',
			attr: 'allocationRole',
			expected: 'reference',
		},
		// type-id reference attrs -> reference (system-owned, resolved internally)
		'LNode.lnType -> reference': { tag: 'LNode', attr: 'lnType', expected: 'reference' },
		'LN.lnType -> reference': { tag: 'LN', attr: 'lnType', expected: 'reference' },
		'LN0.lnType -> reference': { tag: 'LN0', attr: 'lnType', expected: 'reference' },
		'DO.type -> reference': { tag: 'DO', attr: 'type', expected: 'reference' },
		'DA.type -> reference': { tag: 'DA', attr: 'type', expected: 'reference' },
	}

	function act(testCase: TestCase) {
		expect(classifyAttribute(testCase.tag, testCase.attr)).toBe(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})

describe('editableAttributes', () => {
	type TestCase = SclTest.BaseTestCase & {
		tag: string
		includes: { attr: string; mode: 'rename' | 'free' }[]
		excludes: string[]
	}

	const testCases: Record<string, TestCase> = {
		'Function exposes name (rename) + desc (free), hides uuid/templateUuid': {
			tag: 'Function',
			includes: [
				{ attr: 'name', mode: 'rename' },
				{ attr: 'desc', mode: 'free' },
			],
			excludes: ['uuid', 'templateUuid'],
		},
		'LNode hides its identity tuple': {
			tag: 'LNode',
			includes: [],
			excludes: ['lnClass', 'lnInst', 'iedName', 'prefix', 'uuid', 'lnType'],
		},
	}

	function act(testCase: TestCase) {
		const editable = editableAttributes(testCase.tag)
		const byAttr = new Map(editable.map((e) => [e.attr, e.mode]))
		for (const { attr, mode } of testCase.includes) expect(byAttr.get(attr)).toBe(mode)
		for (const attr of testCase.excludes) expect(byAttr.has(attr)).toBe(false)
	}

	runSclTestCases.generic(testCases, act)
})
