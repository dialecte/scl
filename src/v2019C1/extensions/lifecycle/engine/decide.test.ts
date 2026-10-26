import { acceptedRefIds, assertDecisionsCoherent, assertNoAcceptedCollision } from './decide'

import { toDialecteError } from '@dialecte/core'
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

		// A STRUCTURED companion: an unchanged container (the existing FunctionCategory,
		// matched by instanceRef) carrying an `added` ref nested inside — the shape a
		// satellite folded onto an already-existing container takes. The gate must recurse
		// the companion subtree to collect the nested added id, else the accepted ref is
		// never written.
		const nestedCategory: DiffNode = {
			change: 'unchanged',
			tagName: 'FunctionCategory',
			sourceRef: { tagName: 'FunctionCategory', id: 'cat-1' },
			instanceRef: { tagName: 'FunctionCategory', id: 'cat-1' },
			children: [
				{
					change: 'added',
					tagName: 'FunctionCatRef',
					sourceRef: { tagName: 'FunctionCatRef', id: 'ref-1' },
					children: [],
				},
			],
		}
		const g4 = group('g4', 'modified', node('modified', 'Function', 'fn-3'), [nestedCategory])

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
			'structured companion: nested added id is collected (gate recurses the subtree)': {
				groups: [g4],
				decisions: [['g4', 'accept']],
				expected: { sourceIds: ['fn-3', 'ref-1'], instanceIds: [] },
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

		it('accepting a child whose parent is skipped -> refused, naming both', () => {
			const decisions: DecisionMap = new Map([['parent', 'skip']])
			let thrown: unknown
			try {
				assertDecisionsCoherent({ groups: [parent, child], decisions })
			} catch (error) {
				thrown = error
			}
			const refusal = toDialecteError(thrown)
			expect({ key: refusal?.key, meta: refusal?.meta }).toEqual({
				key: 'DECISION_DEPENDENCY_SKIPPED',
				meta: { groupId: 'child', dependencyId: 'parent' },
			})
		})

		it('accepting both parent and child -> ok', () => {
			expect(() =>
				assertDecisionsCoherent({ groups: [parent, child], decisions: new Map() }),
			).not.toThrow()
		})

		it('a decision for a group the report does not list -> refused, naming it', () => {
			const decisions: DecisionMap = new Map([['from-another-report', 'accept']])
			let thrown: unknown
			try {
				assertDecisionsCoherent({ groups: [parent, child], decisions })
			} catch (error) {
				thrown = error
			}
			const refusal = toDialecteError(thrown)
			expect({ key: refusal?.key, code: refusal?.code, meta: refusal?.meta }).toEqual({
				key: 'DECISION_UNKNOWN',
				code: 'SCL1011',
				meta: { groupId: 'from-another-report' },
			})
		})

		it('a group depending on a group the report does not list -> refused, naming both', () => {
			const orphan = group('orphan', 'added', node('added', 'LNode', 'ln-1'), [], ['gone'])
			let thrown: unknown
			try {
				assertDecisionsCoherent({ groups: [parent, orphan], decisions: new Map() })
			} catch (error) {
				thrown = error
			}
			const refusal = toDialecteError(thrown)
			expect({ key: refusal?.key, code: refusal?.code, meta: refusal?.meta }).toEqual({
				key: 'DECISION_DEPENDENCY_UNKNOWN',
				code: 'SCL1012',
				meta: { groupId: 'orphan', dependencyId: 'gone' },
			})
		})

		it('skipping the child while its parent is skipped -> ok', () => {
			const decisions: DecisionMap = new Map([
				['parent', 'skip'],
				['child', 'skip'],
			])
			expect(() => assertDecisionsCoherent({ groups: [parent, child], decisions })).not.toThrow()
		})
	})

	describe('assertNoAcceptedCollision (an addition colliding on a key nothing can change)', () => {
		const projectBreaker = { tagName: 'LNode', id: 'project-breaker' }
		const addition = node('added', 'LNode', 'template-breaker')
		addition.identityCollision = {
			constraint: 'uniqueLNodeInFunctionB',
			fields: ['lnClass', 'lnInst'],
			collidesWith: projectBreaker,
		}
		const added = group('added', 'added', addition)
		// the project's own element is kept unless its removal is accepted
		const projectOwn: DecisionGroup = {
			...group('own', 'target-only', node('target-only', 'LNode', 'project-breaker')),
			suggestedAction: 'skip',
		}
		const unrelated = group('other', 'modified', node('modified', 'Function', 'fn-1'))

		type TestCase = {
			only?: boolean
			groups: DecisionGroup[]
			decisions: [string, 'accept' | 'skip'][]
			/** The refusal's element and the element it collides with; absent: no refusal. */
			expectedRefusal?: { element: unknown; collidesWith: unknown }
		}

		const testCases: Record<string, TestCase> = {
			'the addition accepted, the element it collides with kept -> refused, naming both': {
				groups: [added, projectOwn],
				decisions: [],
				expectedRefusal: {
					element: { tagName: 'LNode', id: 'template-breaker' },
					collidesWith: projectBreaker,
				},
			},
			'the addition accepted with the removal of the element it collides with -> ok': {
				groups: [added, projectOwn],
				decisions: [['own', 'accept']],
			},
			'the addition skipped -> ok': {
				groups: [added, projectOwn],
				decisions: [['added', 'skip']],
			},
			'the collision carried by a companion of an accepted group -> refused': {
				groups: [group('parent', 'modified', node('modified', 'Function', 'fn-1'), [addition])],
				decisions: [],
				expectedRefusal: {
					element: { tagName: 'LNode', id: 'template-breaker' },
					collidesWith: projectBreaker,
				},
			},
			'the collision carried below a companion of an accepted group -> refused': {
				groups: [
					group('parent', 'modified', node('modified', 'Function', 'fn-1'), [
						{ ...node('modified', 'SubFunction', 'sf-1'), children: [addition] },
					]),
				],
				decisions: [],
				expectedRefusal: {
					element: { tagName: 'LNode', id: 'template-breaker' },
					collidesWith: projectBreaker,
				},
			},
			'no group carries a collision -> ok': {
				groups: [unrelated],
				decisions: [],
			},
		}

		function act(testCase: TestCase) {
			const decisions: DecisionMap = new Map(testCase.decisions)
			let thrown: unknown
			try {
				assertNoAcceptedCollision({ groups: testCase.groups, decisions })
			} catch (error) {
				thrown = error
			}
			if (!testCase.expectedRefusal) {
				expect(thrown).toBeUndefined()
				return
			}
			const refusal = toDialecteError(thrown)
			expect({
				key: refusal?.key,
				code: refusal?.code,
				element: refusal?.meta?.element,
				collidesWith: refusal?.meta?.collidesWith,
			}).toEqual({ key: 'IDENTITY_COLLISION', code: 'SCL1010', ...testCase.expectedRefusal })
		}

		runSclTestCases.generic(testCases, act)
	})
})
