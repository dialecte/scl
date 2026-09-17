import { resolveInstantiableRoot } from './root-selection'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	expected: Scl.Ref<'Substation' | 'VoltageLevel' | 'Bay'> | undefined
}

// The instantiable root of a process section: descend
// Substation -> VoltageLevel -> Bay through TEMPLATE-named levels; the first NAMED level is
// the reusable unit. If every level is TEMPLATE, the deepest reached element is the root.
describe('resolveInstantiableRoot', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the first named level below TEMPLATE ancestors (a Bay) is the root': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="MyBay" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Bay', id: 'bay-1' },
		},

		'a named Substation is itself the root': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="sub-1">
						<VoltageLevel name="V1" ${id}="vl-1"/>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Substation', id: 'sub-1' },
		},

		'the first named level can be a VoltageLevel': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="V1" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
		},

		'an all-TEMPLATE chain resolves to the deepest reached level (Bay)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="TEMPLATE" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Bay', id: 'bay-1' },
		},

		'a TEMPLATE Substation with no deeper level is itself the root': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1"/>
				</SCL>
			`,
			expected: { tagName: 'Substation', id: 'sub-1' },
		},

		'no Substation -> undefined': {
			sourceXml: /* xml */ `<SCL ${ns} ${id}="scl-1"/>`,
			expected: undefined,
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const root = await resolveInstantiableRoot(source.query)
		expect(root).toEqual(testCase.expected)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
