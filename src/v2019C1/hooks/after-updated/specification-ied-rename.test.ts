/// <reference types="vite/client" />
import { describe } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/** The fixtures of this file, whole documents read as they are. */
const FIXTURES: Readonly<Record<string, string>> = import.meta.glob<string>('./fixtures/*.xml', {
	query: '?raw',
	import: 'default',
	eager: true,
})

const project = FIXTURES['./fixtures/lnodes-specified-on-a-specification-ied.xml']

describe('the specified naming follows the rename of the specification IED it names', () => {
	type TestCase = SclTest.BaseXmlTestCase & { rename: { ied: string; name: string } }

	const testCases: SclTest.TestCases<TestCase> = {
		'specification IED S1 renamed -> every specified naming naming it follows, the LNodes bound to it too':
			{
				sourceXml: project,
				rename: { ied: 's1', name: 'S9' },
				expectedQueries: [
					'//default:LNode[@uuid="lnode-real-uuid"][@iedName="R1"]//v2019C1:LNodeSpecNaming[@sIedName="S9"]',
					'//default:LNode[@uuid="lnode-on-s1-uuid"][@iedName="S9"]//v2019C1:LNodeSpecNaming[@sIedName="S9"]',
					'//default:LNode[@uuid="lnode-unassigned-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S9"]',
				],
				unexpectedQueries: ['//v2019C1:LNodeSpecNaming[@sIedName="S1"]'],
			},

		'real IED R1 renamed -> a specified naming naming R1 stays': {
			sourceXml: project,
			rename: { ied: 'r1', name: 'R9' },
			expectedQueries: [
				'//default:LNode[@uuid="lnode-specified-on-r1-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="R1"]',
			],
		},

		'specification IED S1 renamed onto the name another IED holds -> the specified namings naming S1 stay':
			{
				sourceXml: project,
				rename: { ied: 's1', name: 'R1' },
				allowInvalidOutput: {
					reason:
						'two IEDs named R1 is the state the rename leaves, the case is what the specified namings do then',
					violations: [{ check: 'uniqueness' }, { check: 'xsd' }],
				},
				expectedQueries: [
					'//default:LNode[@uuid="lnode-real-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"]',
					'//default:LNode[@uuid="lnode-unassigned-uuid"]//v2019C1:LNodeSpecNaming[@sIedName="S1"]',
				],
			},
	}

	async function act({
		source,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const { ied, name } = testCase.rename
		await source.transaction(async (tx) => {
			await tx.update({ tagName: 'IED', id: ied }, { attributes: { name } })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport<TestCase>({ testCases, act })
})
