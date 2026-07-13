import { acceptedRefIds, assertDecisionsCoherent } from './decide'

import { describe, expect, it } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DecisionGroup, DecisionMap, DiffChange, DiffNode } from './diff.types'

// ── fixtures ─────────────────────────────────────────────────────────

function node(change: DiffChange, tag: string, id: string): DiffNode {
	const ref = { tagName: tag, id }
	return {
		change,
		tagName: tag,
		sourceRef: change === 'removed' ? undefined : ref,
		instanceRef: change === 'added' ? undefined : ref,
		children: [],
	}
}

function group(
	id: string,
	change: Exclude<DiffChange, 'unchanged'>,
	primary: DiffNode,
	companions: DiffNode[] = [],
	dependsOn: string[] = [],
): DecisionGroup {
	return {
		id,
		change,
		title: `${change} ${primary.tagName}`,
		primary,
		companions,
		dependsOn,
		suggestedAction: 'accept',
	}
}

describe('decide', () => {
	describe('acceptedRefIds', () => {
		type TestCase = {
			only?: boolean
			groups: DecisionGroup[]
			decisions: [string, 'accept' | 'skip'][]
			expected: { sourceIds: string[]; instanceIds: string[] }
		}

		const g1 = group('g1', 'added', node('added', 'Function', 'fn-1'), [
			node('added', 'LNode', 'ln-1'),
		])
		const g2 = group('g2', 'modified', node('modified', 'Function', 'fn-2'))
		const g3 = group('g3', 'removed', node('removed', 'LNode', 'ln-x'))

		const testCases: Record<string, TestCase> = {
			'accept one, skip another -> only accepted ids (primary + companions)': {
				groups: [g1, g2],
				decisions: [
					['g1', 'accept'],
					['g2', 'skip'],
				],
				expected: { sourceIds: ['fn-1', 'ln-1'], instanceIds: [] },
			},
			'absent group defaults to accept (empty map = accept all)': {
				groups: [g1, g2],
				decisions: [],
				expected: { sourceIds: ['fn-1', 'ln-1', 'fn-2'], instanceIds: [] },
			},
			'removed group contributes instance ids': {
				groups: [g3],
				decisions: [['g3', 'accept']],
				expected: { sourceIds: [], instanceIds: ['ln-x'] },
			},
			'skip the removed group -> nothing to delete': {
				groups: [g3],
				decisions: [['g3', 'skip']],
				expected: { sourceIds: [], instanceIds: [] },
			},
		}

		function act(testCase: TestCase) {
			const decisions: DecisionMap = new Map(testCase.decisions)
			const { sourceIds, instanceIds } = acceptedRefIds({ groups: testCase.groups, decisions })
			expect([...sourceIds].sort()).toEqual(testCase.expected.sourceIds.sort())
			expect([...instanceIds].sort()).toEqual(testCase.expected.instanceIds.sort())
		}

		runSclTestCases.generic(testCases, act)
	})

	describe('assertDecisionsCoherent (dependsOn guard)', () => {
		const parent = group('parent', 'added', node('added', 'Function', 'fn-1'))
		const child = group('child', 'added', node('added', 'SubFunction', 'sf-1'), [], ['parent'])

		it('accepting a child whose parent is skipped -> throws', () => {
			const decisions: DecisionMap = new Map([['parent', 'skip']])
			expect(() => assertDecisionsCoherent({ groups: [parent, child], decisions })).toThrow()
		})

		it('accepting both parent and child -> ok', () => {
			expect(() =>
				assertDecisionsCoherent({ groups: [parent, child], decisions: new Map() }),
			).not.toThrow()
		})

		it('skipping the child while its parent is skipped -> ok', () => {
			const decisions: DecisionMap = new Map([
				['parent', 'skip'],
				['child', 'skip'],
			])
			expect(() => assertDecisionsCoherent({ groups: [parent, child], decisions })).not.toThrow()
		})
	})
})
