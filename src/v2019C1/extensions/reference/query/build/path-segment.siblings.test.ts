import { getPathSegment } from './path-segment'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { AnyRawRecord } from '@dialecte/core'

/** A `SourceRef` of one LNode, named by its `input`. */
function sourceRef(params: { input: string; inputInst: string }): AnyRawRecord {
	return createSclTestRecord({ record: { tagName: 'SourceRef', attributes: params } })
}

/** A `ControlRef` of one LNode, named by its `output`. */
function controlRef(params: { output: string; outputInst: string }): AnyRawRecord {
	return createSclTestRecord({ record: { tagName: 'ControlRef', attributes: params } })
}

// A signal is named among the siblings of its own tag that share its name: a frozen list (as the import gives it) is
// counted once and gives the same names as a list counted at each call, whatever tags it mixes; a list that is not
// frozen is counted again at each call, so a sibling added since is seen.
describe('getPathSegment - a signal named among its siblings', () => {
	type TestCase = {
		/** The siblings as the caller gives them: frozen (the import's list) or not. */
		siblings: readonly AnyRawRecord[]
		expected: string[]
	}

	const tripSource1 = sourceRef({ input: 'Trip', inputInst: '1' })
	const tripSource2 = sourceRef({ input: 'Trip', inputInst: '2' })
	const tripControl = controlRef({ output: 'Trip', outputInst: '1' })
	const closeSource = sourceRef({ input: 'Close', inputInst: '1' })

	const testCases: Record<string, TestCase> = {
		'a frozen list of two SourceRefs and a ControlRef all named Trip → the SourceRefs numbered, the ControlRef plain (alone of its tag)':
			{
				siblings: Object.freeze([tripSource1, tripSource2, tripControl]),
				expected: ['Trip(1)', 'Trip(2)', 'Trip'],
			},
		'the same list not frozen → the same names': {
			siblings: [tripSource1, tripSource2, tripControl],
			expected: ['Trip(1)', 'Trip(2)', 'Trip'],
		},
		'a frozen list of Trip and Close → both plain, each unique by name': {
			siblings: Object.freeze([tripSource1, closeSource]),
			expected: ['Trip', 'Close'],
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			const { siblings } = testCase
			const names = siblings.map((record) => getPathSegment(record, { siblings })?.segment)
			expect(names).toEqual(testCase.expected)
		})
	}

	it('a list not frozen, named, then given a second Trip → named again with the number, not the first count', () => {
		const siblings: AnyRawRecord[] = [tripSource1]
		const before = getPathSegment(tripSource1, { siblings })?.segment
		siblings.push(tripSource2)
		const after = getPathSegment(tripSource1, { siblings })?.segment
		expect({ before, after }).toEqual({ before: 'Trip', after: 'Trip(1)' })
	})
})
