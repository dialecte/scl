import { groupChanges } from './group'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DiffChange, DiffNode } from './diff.types'

// ── DiffNode fixture builders ────────────────────────────────────────

function node(
	change: DiffChange,
	tagName: string,
	id: string,
	children: DiffNode[] = [],
): DiffNode {
	const ref = { tagName, id }
	return {
		change,
		tagName,
		sourceRef: change === 'removed' ? undefined : ref,
		instanceRef: change === 'added' ? undefined : ref,
		children,
	}
}

const added = (tag: string, id: string, children: DiffNode[] = []) =>
	node('added', tag, id, children)
const removed = (tag: string, id: string, children: DiffNode[] = []) =>
	node('removed', tag, id, children)
const modified = (tag: string, id: string, children: DiffNode[] = []) =>
	node('modified', tag, id, children)
const unchanged = (tag: string, id: string, children: DiffNode[] = []) =>
	node('unchanged', tag, id, children)

type ExpectedGroup = {
	id: string
	change: Exclude<DiffChange, 'unchanged'>
	companionTags: string[]
}

type TestCase = {
	only?: boolean
	root: DiffNode
	expected: ExpectedGroup[]
}

describe('groupChanges', () => {
	const testCases: Record<string, TestCase> = {
		'all unchanged -> no groups': {
			root: unchanged('Function', 'fn-1', [unchanged('LNode', 'ln-1')]),
			expected: [],
		},

		'added subtree -> one group; descendants are companions': {
			root: added('Function', 'fn-1', [added('LNode', 'ln-1'), added('LNode', 'ln-2')]),
			expected: [{ id: 'Function:fn-1', change: 'added', companionTags: ['LNode', 'LNode'] }],
		},

		'two separate changed regions under an unchanged root -> two groups': {
			root: unchanged('Bay', 'bay-1', [
				modified('Function', 'fn-1'),
				added('Function', 'fn-2', [added('LNode', 'ln-2')]),
			]),
			expected: [
				{ id: 'Function:fn-1', change: 'modified', companionTags: [] },
				{ id: 'Function:fn-2', change: 'added', companionTags: ['LNode'] },
			],
		},

		'nested change under an unchanged wrapper folds as a companion (not its own group)': {
			root: modified('Function', 'fn-1', [
				unchanged('SubFunction', 'sf-1', [modified('LNode', 'ln-deep')]),
			]),
			expected: [{ id: 'Function:fn-1', change: 'modified', companionTags: ['LNode'] }],
		},

		'removed node -> group keyed by instanceRef': {
			root: unchanged('Bay', 'bay-1', [
				removed('Function', 'fn-old', [removed('LNode', 'ln-old')]),
			]),
			expected: [{ id: 'Function:fn-old', change: 'removed', companionTags: ['LNode'] }],
		},
	}

	function act(testCase: TestCase) {
		const groups = groupChanges(testCase.root)

		expect(groups).toHaveLength(testCase.expected.length)
		for (const [i, expected] of testCase.expected.entries()) {
			const group = groups[i]
			expect(group.id).toBe(expected.id)
			expect(group.change).toBe(expected.change)
			expect(group.suggestedAction).toBe('accept')
			expect(group.dependsOn).toEqual([])
			expect(group.companions.map((c) => c.tagName)).toEqual(expected.companionTags)
			// the primary is never listed among its own companions
			expect(group.companions).not.toContain(group.primary)
		}
	}

	runSclTestCases.generic(testCases, act)
})
