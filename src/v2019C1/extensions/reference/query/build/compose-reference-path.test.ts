import { composeReferencePath } from './compose-reference-path'
import { joinPathParts } from './path-segment'

import { describe, expect } from 'vitest'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { RESOLUTION_TYPE } from '@/v2019C1/extensions/reference/constants'
import { runSclTestCases } from '@/v2019C1/test'

import type { ReferrerContext } from './compose-reference-path.types'
import type { PathSegmentWithRef } from './path-segment.types'
import type { SclTest } from '@/v2019C1/test'

const addressPair = UUID_REFERENCE_PAIRS.SourceRef.find(
	(pair) => pair.resolution === RESOLUTION_TYPE.iedAddress,
)

/** The segments of the path to the logical node `GGIO1` of `LD0` in `B1`. */
const LOGICAL_NODE_SEGMENTS: PathSegmentWithRef[] = [
	{ segment: 'B1', separator: '/', ref: { tagName: 'IED', id: 'ied' } },
	{ segment: 'LD0', separator: '/', ref: { tagName: 'LDevice', id: 'ld' } },
	{ segment: 'GGIO1', separator: '/', ref: { tagName: 'LN', id: 'ln' } },
]

/** The same, down to an ExtRef of internal address `Trip`. */
const EXT_REF_SEGMENTS: PathSegmentWithRef[] = [
	...LOGICAL_NODE_SEGMENTS,
	{ segment: 'Trip', separator: '.', ref: { tagName: 'ExtRef', id: 'ext-ref' } },
]

/** The same, for a logical node held directly by the access point: no logical device. */
const ACCESS_POINT_EXT_REF_SEGMENTS: PathSegmentWithRef[] = [
	{ segment: 'B1', separator: '/', ref: { tagName: 'IED', id: 'ied' } },
	{ segment: 'IHMI1', separator: '/', ref: { tagName: 'LN', id: 'ln-ap' } },
	{ segment: 'Trip', separator: '.', ref: { tagName: 'ExtRef', id: 'ext-ref' } },
]

describe('composeReferencePath, ied-address', () => {
	type TestCase = SclTest.BaseTestCase & {
		segments: PathSegmentWithRef[]
		referrerContext?: ReferrerContext
		expected: string | null
	}

	const testCases: Record<string, TestCase> = {
		'ExtRef without internal address, LNode mapped to its logical node → no address': {
			segments: LOGICAL_NODE_SEGMENTS,
			referrerContext: { mappedLnPath: 'B1/LD0/GGIO1' },
			expected: null,
		},
		'ExtRef without internal address, LNode not mapped → no address': {
			segments: LOGICAL_NODE_SEGMENTS,
			referrerContext: { mappedLnPath: null },
			expected: null,
		},
		'ExtRef without internal address, no referrer context → no address': {
			segments: LOGICAL_NODE_SEGMENTS,
			expected: null,
		},
		'ExtRef in the logical node the LNode is mapped to → internal address alone': {
			segments: EXT_REF_SEGMENTS,
			referrerContext: { mappedLnPath: 'B1/LD0/GGIO1' },
			expected: 'Trip',
		},
		'ExtRef in another logical node of the IED the LNode is mapped to → path below the IED': {
			segments: EXT_REF_SEGMENTS,
			referrerContext: { mappedLnPath: 'B1/LD0/XCBR1' },
			expected: 'LD0/GGIO1.Trip',
		},
		'ExtRef in another IED than the one the LNode is mapped to → full path': {
			segments: EXT_REF_SEGMENTS,
			referrerContext: { mappedLnPath: 'B2/LD0/GGIO1' },
			expected: 'B1/LD0/GGIO1.Trip',
		},
		'ExtRef in a logical node held by the access point, LNode mapped to the IED → full path': {
			segments: ACCESS_POINT_EXT_REF_SEGMENTS,
			referrerContext: { mappedLnPath: 'B1/LD0/XCBR1' },
			expected: 'B1/IHMI1.Trip',
		},
		'LNode not mapped → full path': {
			segments: EXT_REF_SEGMENTS,
			referrerContext: { mappedLnPath: null },
			expected: 'B1/LD0/GGIO1.Trip',
		},
		'no referrer context → full path': {
			segments: EXT_REF_SEGMENTS,
			expected: 'B1/LD0/GGIO1.Trip',
		},
	}

	runSclTestCases.generic(testCases, (testCase) => {
		if (!addressPair) throw new Error('the SourceRef has an address pair')
		const path = composeReferencePath({
			pair: addressPair,
			referenceAttributes: [],
			targetPath: {
				path: joinPathParts(testCase.segments),
				segments: testCase.segments,
			},
			referrerContext: testCase.referrerContext,
		})
		expect(path).toBe(testCase.expected)
	})
})
