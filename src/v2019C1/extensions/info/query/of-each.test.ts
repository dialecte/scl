import { ofEach } from './of-each'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('ofEach', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		refs: Scl.Ref<Scl.ElementsOf>[]
		expected: { title: string; state?: unknown }[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an LNode and its SourceRef → their infos, in the order given': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" ${id}="lnode">
								<eIEC61850-6-100:LNodeInputs ${id}="in">
									<eIEC61850-6-100:SourceRef input="Trip" ${id}="sr"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			refs: [
				{ tagName: 'SourceRef', id: 'sr' },
				{ tagName: 'LNode', id: 'lnode' },
			],
			expected: [
				{ title: 'Trip', state: { binding: 'open', implemented: false } },
				{ title: 'PTRC1', state: { locked: true, mapping: 'unmapped' } },
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const infos = await ofEach(source.query, testCase.refs)
			expect(infos.map(({ title, state }) => ({ title, state }))).toEqual(testCase.expected)
		},
	})
})
