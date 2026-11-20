import bayWithReferencesToComeXml from './fixtures/a-bay-with-references-to-a-function-and-a-node-to-come.xml?raw'

import { describe, expect } from 'vitest'

import { resolveReferencePath } from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'
import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const TO_COME_REASON = 'the source names, by uuid, a node and a function the transaction creates'
const TO_COME = '00000000-0000-4000-8000-0000000000a1'
const NODE_TO_COME = '00000000-0000-4000-8000-0000000000c1'

/**
 * Contract: a reader inside the transaction, right after the write and before the commit, reads the path a created
 * element gives its stored references (a caller's own read).
 */
describe('created references - read inside the transaction, right after the write', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		write: (tx: Scl.Transaction) => Promise<void>
		read: Scl.Ref<Scl.ElementsOf>
		attribute: string
		expected: string
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created → its stored reference holds its path': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function creatingTheFunction(tx) {
				await tx.addChild(
					{ tagName: 'Bay', id: 'b1' },
					{ tagName: 'Function', attributes: { name: 'F2', uuid: TO_COME } },
				)
			},
			read: { tagName: 'FunctionCatRef', id: 'ref-a' },
			attribute: 'function',
			expected: 'S1/VL1/B1/F2',
		},
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a node created → its stored terminal holds its bay name': {
			sourceXml: bayWithReferencesToComeXml,
			allowIncoherentReferences: TO_COME_REASON,
			write: async function creatingTheNode(tx) {
				await tx.addChild(
					{ tagName: 'Bay', id: 'b1' },
					// the hooks write the node's pathName: the case gives none
					{ tagName: 'ConnectivityNode', attributes: { name: 'L1', uuid: NODE_TO_COME } as never },
				)
			},
			read: { tagName: 'Terminal', id: 't1' },
			attribute: 'bayName',
			expected: 'B1',
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction(async function writeThenRead(tx) {
				await testCase.write(tx)
				const value = await tx.getAttribute(testCase.read, { name: testCase.attribute } as never)
				expect(value).toBe(testCase.expected)
			})
		},
	})
})

/** Contract: a verb run on the transaction resolves a stored reference to the element the transaction just created. */
describe('created references - resolved by a verb on the transaction, right after the write', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// the fixture: two category references and a terminal naming, by uuid, a function and a node the case creates
		'a function created → resolveReferencePath on the transaction resolves its stored reference to it':
			{
				sourceXml: bayWithReferencesToComeXml,
				allowIncoherentReferences: TO_COME_REASON,
			},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source }) => {
			await source.transaction(async function createThenResolve(tx) {
				const created = await tx.addChild(
					{ tagName: 'Bay', id: 'b1' },
					{ tagName: 'Function', attributes: { name: 'F2', uuid: TO_COME } },
				)
				const reference = await tx.getRecord({ tagName: 'FunctionCatRef', id: 'ref-a' })
				const resolved = await resolveReferencePath(tx, reference as never, 'function')
				expect(resolved?.record.id).toBe(created.id)
			})
		},
	})
})
