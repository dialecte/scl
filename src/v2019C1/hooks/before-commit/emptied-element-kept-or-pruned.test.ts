import dataSetsSentByThreeBlocks from '../before-delete/fixtures/data-sets-sent-by-three-blocks.xml?raw'
import functionRefAndSignalRoles from './fixtures/a-function-ref-and-its-signal-roles.xml?raw'
import { pruneEmptiedContainers } from './prune-emptied-containers'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

describe('an element of its own left without a child its content model requires', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// a-function-ref-and-its-signal-roles.xml: application A1 holds one role, R1; its validity is a validation's to say
		"the application's only role deleted → committed, the application kept": {
			sourceXml: functionRefAndSignalRoles,
			allowInvalidOutput: {
				reason:
					"an application without a role is the validation's to flag: the engine allows it, as it allows creating one",
				violations: [{ check: 'xsd', code: 'missing-child' }],
			},
			expectedQueries: ['//v2019C1:Application[@name="A1"]'],
			unexpectedQueries: ['//v2019C1:FunctionRole'],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function deleteRole(tx) {
			await tx.delete({ tagName: 'FunctionRole', id: 'r1' } as Scl.Ref<Scl.ElementsOf>)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit prune of a container whose last required child moved away', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: string[] }

	const testCases: SclTest.TestCases<TestCase> = {
		// data-sets-sent-by-three-blocks.xml: server srv7 holds its authentication and its only device ld7; the server's
		// children updated without ld7, no delete of it: the shape a move leaves its former parent in
		'a server its only device moved out of → the server pruned': {
			sourceXml: dataSetsSentByThreeBlocks,
			expected: ['Server:srv7'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const server = await source.query.getRecord({
			tagName: 'Server',
			id: 'srv7',
		} as Scl.Ref<Scl.ElementsOf>)
		if (!server) throw new Error('srv7 missing')
		const oldRecord = toRawRecord(server) as Scl.RawRecord<Scl.ElementsOf>
		const newRecord = {
			...oldRecord,
			children: oldRecord.children.filter((child) => child.id !== 'ld7'),
		} as Scl.RawRecord<Scl.ElementsOf>
		const pruned = await pruneEmptiedContainers({
			operations: [{ status: 'updated', oldRecord, newRecord }],
			query: source.query,
			pending: new Map(),
		})
		const roots = pruned
			.flatMap((operation) => (operation.status === 'deleted' ? [operation.oldRecord] : []))
			.filter((record) => record.tagName === 'Server')
			.map((record) => `${record.tagName}:${record.id}`)
		expect(roots).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
