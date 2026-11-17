import functionRefAndSignalRoles from './fixtures/a-function-ref-and-its-signal-roles.xml?raw'

import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const FUNCTION_REF = { tagName: 'FunctionRef', id: 'function-ref' } as Scl.Ref<Scl.ElementsOf>
const F1 = { tagName: 'Function', id: 'f1' } as Scl.Ref<Scl.ElementsOf>

describe('the signal roles below a FunctionRef follow the function its path edit names', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// a-function-ref-and-its-signal-roles.xml: the output ref names Oper from F1 down
		'the path edited to SF1 → the FunctionRef names SF1, the output ref names Oper from SF1 down': {
			sourceXml: functionRefAndSignalRoles,
			path: 'S1/F1/SF1',
			expectedQueries: [
				'//v2019C1:FunctionRef[@function="S1/F1/SF1"][@functionUuid="sf1"]',
				'//v2019C1:LNodeOutputRef[@controlRef="XCBR1.Oper"][@controlRefUuid="oper"]',
			],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editFunctionRefPath(tx) {
			await tx.any.update(FUNCTION_REF, { attributes: { function: testCase.path } })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the signal roles below a FunctionRef follow the function its path edit names, created after the edit', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; created: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// SF2, created in F1 after the edit, holds no breaker: Oper is not below it, so the output ref names it whole
		'the path edited to SF2, which the transaction creates next → the output ref names Oper by its whole path':
			{
				sourceXml: functionRefAndSignalRoles,
				path: 'S1/F1/SF2',
				created: { name: 'SF2', uuid: 'sf2' },
				expectedQueries: [
					'//v2019C1:FunctionRef[@function="S1/F1/SF2"][@functionUuid="sf2"]',
					'//v2019C1:LNodeOutputRef[@controlRef="S1/F1/SF1/XCBR1.Oper"][@controlRefUuid="oper"]',
				],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editFunctionRefPathThenCreate(tx) {
			await tx.any.update(FUNCTION_REF, { attributes: { function: testCase.path } })
			await tx.any.addChild(F1, { tagName: 'SubFunction', attributes: testCase.created })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
