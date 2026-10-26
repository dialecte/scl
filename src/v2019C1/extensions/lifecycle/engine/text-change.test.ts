import { textChangeOf } from './text-change'

import { describe, expect, it } from 'vitest'

import type { TextChange } from './diff.types'
import type { AnyTreeRecord } from '@dialecte/core'

/** A tree record holding `value`, with an element child or none. */
function treeOf(params: { value: string; withChild?: boolean }): AnyTreeRecord {
	const { value, withChild = false } = params
	const child = { tagName: 'Text', id: 'text' }
	return {
		tagName: 'BayType',
		id: 'element',
		value,
		attributes: [],
		namespace: { prefix: '', uri: '' },
		parent: null,
		children: withChild ? [child] : [],
		tree: withChild
			? [
					{
						...child,
						value: '',
						attributes: [],
						namespace: { prefix: '', uri: '' },
						parent: null,
						children: [],
						tree: [],
					},
				]
			: [],
	} as unknown as AnyTreeRecord
}

const testCases: Record<
	string,
	{ source: AnyTreeRecord; instance: AnyTreeRecord; expected: TextChange | undefined }
> = {
	'another text': {
		source: treeOf({ value: 'Cable feeder' }),
		instance: treeOf({ value: 'Line feeder' }),
		expected: { before: 'Line feeder', after: 'Cable feeder' },
	},
	'the same text, laid out otherwise': {
		source: treeOf({ value: ' Line feeder ' }),
		instance: treeOf({ value: 'Line feeder\n' }),
		expected: undefined,
	},
	'the template element holds an element': {
		source: treeOf({ value: 'v2', withChild: true }),
		instance: treeOf({ value: 'v1' }),
		expected: undefined,
	},
	'the instance element holds an element': {
		source: treeOf({ value: 'v2' }),
		instance: treeOf({ value: 'v1', withChild: true }),
		expected: undefined,
	},
}

describe('the text of a matched element the template changed', () => {
	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, function compareTheTexts() {
			expect(
				textChangeOf({ sourceNode: testCase.source, instanceNode: testCase.instance }),
			).toEqual(testCase.expected)
		})
	}
})
