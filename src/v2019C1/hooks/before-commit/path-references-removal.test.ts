import bayWithATerminal from './fixtures/bay-with-a-terminal.xml?raw'
import breakersAndATripInput from './fixtures/breakers-and-a-trip-input.xml?raw'
import functionsAndACategory from './fixtures/functions-and-a-category.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('an edit of the path of a reference holding a uuid, by whether the definition requires the path', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		reference: Scl.Ref<Scl.ElementsOf>
		/** The path attribute's new value; none removes it. */
		edited: Record<string, string | undefined>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// functions-and-a-category.xml: ref1 names F1 by path and uuid; FunctionCatRef@function is optional
		'an optional path removed → the reference unbound, its uuid removed with it': {
			sourceXml: functionsAndACategory,
			reference: { tagName: 'FunctionCatRef', id: 'ref1' } as Scl.Ref<Scl.ElementsOf>,
			edited: { function: undefined },
			expectedQueries: ['//v2019C1:FunctionCategory[@name="C1"]/v2019C1:FunctionCatRef'],
			unexpectedQueries: ['//v2019C1:FunctionCatRef[@function or @functionUuid]'],
		},
		// breakers-and-a-trip-input.xml: ref1 names Pos.stVal of XCBR1 (its data named beside it) and resource PR1
		'an optional data path removed → unbound, its uuid and data names removed, the resource kept': {
			sourceXml: breakersAndATripInput,
			reference: { tagName: 'SourceRef', id: 'ref1' } as Scl.Ref<Scl.ElementsOf>,
			edited: { source: undefined },
			expectedQueries: [
				'//v2019C1:SourceRef[@input="Pos"][@resourceName="PR1"][@resourceUuid="pr1"]',
			],
			unexpectedQueries: [
				'//v2019C1:SourceRef[@source or @sourceLNodeUuid or @sourceDoName or @sourceDaName]',
			],
		},
		// bay-with-a-terminal.xml: t1 connected to L1 by path and uuid; Terminal@connectivityNode is required
		'a required path removed → written again from the uuid': {
			sourceXml: bayWithATerminal,
			reference: { tagName: 'Terminal', id: 't1' } as Scl.Ref<Scl.ElementsOf>,
			edited: { connectivityNode: undefined },
			expectedQueries: ['//default:Terminal[@connectivityNode="S1/VL1/B1/L1"][@cNodeUuid="n1"]'],
		},
		// the same terminal, its path pointed at L2
		'a required path pointed at another node → the uuid and the level names follow': {
			sourceXml: bayWithATerminal,
			reference: { tagName: 'Terminal', id: 't1' } as Scl.Ref<Scl.ElementsOf>,
			edited: { connectivityNode: 'S1/VL1/B1/L2' },
			expectedQueries: [
				'//default:Terminal[@connectivityNode="S1/VL1/B1/L2"][@cNodeName="L2"][@cNodeUuid="n2"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editPath(tx) {
			// `update` removes an attribute given `undefined`
			await tx.any.update(testCase.reference, {
				attributes: testCase.edited as unknown as Record<string, string>,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a required path edited, then removed in the same transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// bay-with-a-terminal.xml: t1 connected to L1 by path and uuid; its path pointed at L2, then removed
		'the path pointed at another node, then removed → written again from the uuid it holds': {
			sourceXml: bayWithATerminal,
			path: 'S1/VL1/B1/L2',
			expectedQueries: ['//default:Terminal[@connectivityNode="S1/VL1/B1/L1"][@cNodeUuid="n1"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const terminal = { tagName: 'Terminal', id: 't1' } as Scl.Ref<Scl.ElementsOf>
		await source.transaction(async function editThenRemovePath(tx) {
			await tx.any.update(terminal, { attributes: { connectivityNode: testCase.path } })
			// `update` removes an attribute given `undefined`
			await tx.any.update(terminal, {
				attributes: { connectivityNode: undefined } as unknown as Record<string, string>,
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
