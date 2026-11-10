import { isNativeNode } from './is-native-node'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { createSclTestRecord, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'
import type { AnyRawRecord } from '@dialecte/core'

const SCL_URI = SCL_DIALECTE_CONFIG.namespaces.default.uri
const EXTENSION_URI = SCL_DIALECTE_CONFIG.namespaces.v2019C1.uri

type TestCase = SclTest.BaseTestCase & {
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
	expected: boolean
}

const ROOT = record({ tagName: 'SCL', id: 'root' })
const LDEVICE = record({ tagName: 'LDevice', id: 'ld', parentId: 'root' })

function record(params: {
	tagName: string
	id: string
	parentId?: string
	namespaceUri?: string
}): AnyRawRecord {
	const { tagName, id, parentId, namespaceUri = SCL_URI } = params
	const created = createSclTestRecord({
		record: {
			tagName,
			id,
			parent: parentId ? { tagName: 'SCL', id: parentId } : null,
			namespace: { prefix: '', uri: namespaceUri },
		},
	} as Parameters<typeof createSclTestRecord>[0])
	return toRawRecord(created) as AnyRawRecord
}

describe('isNativeNode', () => {
	const testCases: Record<string, TestCase> = {
		'element under its real parent → native': {
			record: record({ tagName: 'LN', id: 'ln', parentId: 'ld' }),
			ancestry: [ROOT, LDEVICE],
			expected: true,
		},
		'extension element through a Private → native': {
			record: record({
				tagName: 'FunctionTemplate',
				id: 'template',
				parentId: 'private',
				namespaceUri: EXTENSION_URI,
			}),
			ancestry: [ROOT],
			expected: true,
		},
		'element of the document namespace through a Private → not native': {
			record: record({ tagName: 'LN', id: 'ln', parentId: 'private' }),
			ancestry: [ROOT, LDEVICE],
			expected: false,
		},
		'element of a foreign namespace through a Private → not native': {
			record: record({ tagName: 'LN', id: 'ln', parentId: 'private', namespaceUri: 'urn:vendor' }),
			ancestry: [ROOT, LDEVICE],
			expected: false,
		},
		'element under its real parent, a holder above it not native → not native': {
			record: record({ tagName: 'LN', id: 'ln', parentId: 'vendor-ld' }),
			ancestry: [
				ROOT,
				record({
					tagName: 'LDevice',
					id: 'vendor-ld',
					parentId: 'private',
					namespaceUri: 'urn:vendor',
				}),
			],
			expected: false,
		},
	}

	function act(testCase: TestCase): void {
		expect(isNativeNode(testCase)).toBe(testCase.expected)
	}

	runSclTestCases.generic(testCases, act)
})
