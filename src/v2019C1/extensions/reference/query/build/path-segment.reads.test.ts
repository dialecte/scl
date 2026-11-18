import { getPathSegment } from './path-segment'

import { describe, expect, it } from 'vitest'

import { createSclTestRecord } from '@/v2019C1/test'

import type { AnyRawRecord } from '@dialecte/core'

/** Signals of one LNode, each named `Trip` with its own instance: siblings that share a name. */
function tripSignals(params: { count: number }): AnyRawRecord[] {
	return Array.from({ length: params.count }, function tripOfIndex(_, index) {
		return createSclTestRecord({
			record: { tagName: 'SourceRef', attributes: { input: 'Trip', inputInst: String(index + 1) } },
		})
	})
}

/**
 * The siblings, each counting the reads of its attributes: `reads()` answers how many there were since the start.
 */
function countingAttributeReads(params: { records: readonly AnyRawRecord[] }): {
	records: AnyRawRecord[]
	reads: () => number
} {
	let count = 0
	const records = params.records.map(function counting(record) {
		return new Proxy(record, {
			get(target, property, receiver) {
				if (property === 'attributes') count += 1
				return Reflect.get(target, property, receiver)
			},
		})
	})
	return { records, reads: () => count }
}

// Naming every signal of an LNode among the frozen list of its siblings (as the import gives it) reads each sibling's
// attributes a fixed number of times: the names they share are counted once per list, not once per signal named.
describe('getPathSegment - naming every signal among its siblings reads each sibling a fixed number of times', () => {
	type TestCase = { siblings: number; expected: { attributeReadsPerSignal: number } }

	const testCases: Record<string, TestCase> = {
		'10 signals sharing a name, each named → 4 attribute reads per signal': {
			siblings: 10,
			expected: { attributeReadsPerSignal: 4 },
		},
		'40 signals sharing a name, each named → 4 attribute reads per signal, as for 10': {
			siblings: 40,
			expected: { attributeReadsPerSignal: 4 },
		},
	}

	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, () => {
			const { records, reads } = countingAttributeReads({
				records: tripSignals({ count: testCase.siblings }),
			})
			// the siblings as the import gives them: one frozen list per parent
			const siblings = Object.freeze(records)
			for (const record of records) getPathSegment(record, { siblings })
			expect({ attributeReadsPerSignal: reads() / testCase.siblings }).toEqual(testCase.expected)
		})
	}
})
