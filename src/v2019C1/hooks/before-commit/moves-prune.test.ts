import fourFunctions from './fixtures/four-functions-with-resources-and-a-behaviour.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('an element of the extension namespace moved under an element of the default one is wrapped', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// a Function holds the elements of the extension in a Private of their namespace; F3 holds none yet
		'the resources of F1 moved under F3 → wrapped in a new Private of F3, the emptied Private of F1 gone':
			{
				sourceXml: fourFunctions,
				expectedQueries: [
					'//default:Function[@name="F3"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:ProcessResources/v2019C1:ProcessResource[@name="PR1"]',
				],
				unexpectedQueries: [
					'//default:Function[@name="F3"]/v2019C1:ProcessResources',
					'//default:Function[@name="F1"]/default:Private',
				],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveUnderAFunction(tx) {
			await tx.any.move(
				{ tagName: 'ProcessResources', id: 'f1-resources' },
				{
					parent: { tagName: 'Function', id: 'f3' },
				},
			)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('an element of the extension namespace moved under a parent holding a Private of its namespace joins it', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// F2 holds a Private of the extension already
		'BD4 moved under F2 → in the Private F2 holds, the only one': {
			sourceXml: fourFunctions,
			expectedQueries: [
				'//default:Function[@name="F2"][count(default:Private)=1]/default:Private[v2019C1:ProcessResources]/v2019C1:BehaviorDescription[@name="BD4"]',
			],
			unexpectedQueries: [
				'//default:Function[@name="F4"]//v2019C1:BehaviorDescription[@name="BD4"]',
			],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveUnderAFunctionWithAPrivate(tx) {
			await tx.any.move(
				{ tagName: 'BehaviorDescription', id: 'bd4' },
				{
					parent: { tagName: 'Function', id: 'f2' },
				},
			)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('extension elements moved under one parent of the default namespace share one Private', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		elements: Scl.Ref<Scl.ElementsOf>[]
		parent: Scl.Ref<Scl.ElementsOf>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// F3 holds no Private; the resources of F1 and BD4 of F4 go there in one transaction
		'the resources of F1 and BD4 moved under F3 → one new Private of F3 holds both': {
			sourceXml: fourFunctions,
			elements: [
				{ tagName: 'ProcessResources', id: 'f1-resources' },
				{ tagName: 'BehaviorDescription', id: 'bd4' },
			],
			parent: { tagName: 'Function', id: 'f3' },
			expectedQueries: [
				'//default:Function[@name="F3"][count(default:Private)=1]/default:Private[v2019C1:ProcessResources/v2019C1:ProcessResource[@name="PR1"]][v2019C1:BehaviorDescription[@name="BD4"]]',
			],
		},
		// F2 holds a Private of the extension already; BD4 and BD5 are all F4's Private holds
		'BD4 and BD5 moved under F2 → both in the Private F2 holds, with its resources': {
			sourceXml: fourFunctions,
			elements: [
				{ tagName: 'BehaviorDescription', id: 'bd4' },
				{ tagName: 'BehaviorDescription', id: 'bd5' },
			],
			parent: { tagName: 'Function', id: 'f2' },
			expectedQueries: [
				'//default:Function[@name="F2"][count(default:Private)=1]/default:Private[v2019C1:ProcessResources][v2019C1:BehaviorDescription[@name="BD4"]][v2019C1:BehaviorDescription[@name="BD5"]]',
			],
			unexpectedQueries: ['//default:Function[@name="F4"]/default:Private'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveEach(tx) {
			for (const element of testCase.elements)
				await tx.any.move(element, { parent: testCase.parent })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
