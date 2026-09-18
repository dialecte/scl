import { annotateInstance, sourceToTargetMap } from './correlate'

import { describe, expect, it } from 'vitest'

import type { AppliedTargets } from './correlate'
import type { DiffNode, ReportInstance } from './diff.types'
import type { AnyRefOrRecord } from '@dialecte/core'

// Minimal refs — annotateInstance only reads `id`/`tagName`.
const ref = (tagName: string, id: string): AnyRefOrRecord => ({ tagName, id }) as AnyRefOrRecord

const node = (partial: Partial<DiffNode> & Pick<DiffNode, 'change' | 'tagName'>): DiffNode => ({
	children: [],
	...partial,
})

const instance = (tree: DiffNode, groups: ReportInstance['groups'] = []): ReportInstance => ({
	title: 't',
	linked: false,
	upToDate: false,
	tree,
	groups,
})

describe('sourceToTargetMap', () => {
	it('maps each source id to its target ref', () => {
		const mappings = [
			{ source: { ...ref('Function', 's1'), attributes: [] }, target: ref('Function', 'a1') },
			{ source: { ...ref('LNode', 's2'), attributes: [] }, target: ref('LNode', 'a2') },
		] as unknown as Parameters<typeof sourceToTargetMap>[0]
		const map = sourceToTargetMap(mappings)
		expect(map.get('s1')).toEqual(ref('Function', 'a1'))
		expect(map.get('s2')).toEqual(ref('LNode', 'a2'))
	})
})

describe('annotateInstance', () => {
	it('matched/modified/unchanged nodes resolve appliedRef to their own instanceRef', () => {
		const tree = node({
			change: 'unchanged',
			tagName: 'Function',
			sourceRef: ref('Function', 's-root'),
			instanceRef: ref('Function', 'i-root'),
			children: [
				node({
					change: 'modified',
					tagName: 'LNode',
					sourceRef: ref('LNode', 's-ln'),
					instanceRef: ref('LNode', 'i-ln'),
				}),
			],
		})
		annotateInstance({ reportInstance: instance(tree), added: new Map() })
		expect(tree.appliedRef).toEqual(ref('Function', 'i-root'))
		expect(tree.children[0]!.appliedRef).toEqual(ref('LNode', 'i-ln'))
	})

	it('added nodes resolve appliedRef via the added map keyed by sourceRef.id', () => {
		const added: AppliedTargets = new Map([['s-new', ref('SubFunction', 'a-new')]])
		const tree = node({
			change: 'unchanged',
			tagName: 'Function',
			instanceRef: ref('Function', 'i-root'),
			children: [
				node({ change: 'added', tagName: 'SubFunction', sourceRef: ref('SubFunction', 's-new') }),
			],
		})
		annotateInstance({ reportInstance: instance(tree), added })
		expect(tree.children[0]!.appliedRef).toEqual(ref('SubFunction', 'a-new'))
	})

	it('removed nodes get no appliedRef', () => {
		const tree = node({
			change: 'unchanged',
			tagName: 'Function',
			instanceRef: ref('Function', 'i-root'),
			children: [
				node({ change: 'removed', tagName: 'LNode', instanceRef: ref('LNode', 'i-gone') }),
			],
		})
		annotateInstance({ reportInstance: instance(tree), added: new Map() })
		expect(tree.children[0]!.appliedRef).toBeUndefined()
	})

	it('annotates external companion subtrees (satellites outside the instance root)', () => {
		const companion = node({
			change: 'added',
			tagName: 'FunctionCategory',
			sourceRef: ref('FunctionCategory', 's-cat'),
		})
		const tree = node({
			change: 'unchanged',
			tagName: 'Function',
			instanceRef: ref('Function', 'i-root'),
		})
		const groups: ReportInstance['groups'] = [
			{
				id: 'g1',
				change: 'added',
				title: 'added FunctionCategory',
				primary: companion,
				companions: [companion],
				dependsOn: [],
				suggestedAction: 'accept',
			},
		]
		const added: AppliedTargets = new Map([['s-cat', ref('FunctionCategory', 'a-cat')]])
		annotateInstance({ reportInstance: instance(tree, groups), added })
		expect(companion.appliedRef).toEqual(ref('FunctionCategory', 'a-cat'))
	})

	it('two instances of one template annotate independently (multi-instance disambiguation)', () => {
		const makeTree = (): DiffNode =>
			node({
				change: 'unchanged',
				tagName: 'Function',
				instanceRef: ref('Function', 'i'),
				children: [
					node({ change: 'added', tagName: 'LNode', sourceRef: ref('LNode', 's-shared') }),
				],
			})
		const treeA = makeTree()
		const treeB = makeTree()
		annotateInstance({
			reportInstance: instance(treeA),
			added: new Map([['s-shared', ref('LNode', 'a-A')]]),
		})
		annotateInstance({
			reportInstance: instance(treeB),
			added: new Map([['s-shared', ref('LNode', 'a-B')]]),
		})
		expect(treeA.children[0]!.appliedRef).toEqual(ref('LNode', 'a-A'))
		expect(treeB.children[0]!.appliedRef).toEqual(ref('LNode', 'a-B'))
	})
})
