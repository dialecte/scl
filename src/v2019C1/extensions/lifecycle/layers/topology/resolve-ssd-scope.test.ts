import { resolveSsdScope } from './resolve-ssd-scope'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	/** The element the consumer names; none: the scope is read from the file. */
	ref?: Scl.Ref<TopologyStructuralTag>
	expected?: Scl.Ref<TopologyStructuralTag> | undefined
	/** The refusal: its key and the units it lists. */
	expectedRefusal?: { key: string; candidates: { tagName: string; id: string; name: string }[] }
}

const twoNamedBays = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="TEMPLATE" ${id}="sub-1">
			<VoltageLevel name="TEMPLATE" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1"/>
				<Bay name="B2" ${id}="bay-2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The scope of an SSD: the element the consumer names when it is named; the TEMPLATE scaffolding,
// named or read from the file, is walked down Substation -> VoltageLevel -> Bay to the first level
// holding a named element - the reusable unit. Several named units there: the consumer chooses.
describe('resolveSsdScope', () => {
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
		'two named bays at the first named level, none chosen: refused with both': {
			sourceXml: twoNamedBays,
			expectedRefusal: {
				key: 'SSD_SCOPE_AMBIGUOUS',
				candidates: [
					{ tagName: 'Bay', id: 'bay-1', name: 'B1' },
					{ tagName: 'Bay', id: 'bay-2', name: 'B2' },
				],
			},
		},

		'two named bays, the TEMPLATE substation named: refused with both': {
			sourceXml: twoNamedBays,
			ref: { tagName: 'Substation', id: 'sub-1' },
			expectedRefusal: {
				key: 'SSD_SCOPE_AMBIGUOUS',
				candidates: [
					{ tagName: 'Bay', id: 'bay-1', name: 'B1' },
					{ tagName: 'Bay', id: 'bay-2', name: 'B2' },
				],
			},
		},

		'two named bays, the second chosen: it is the scope': {
			sourceXml: twoNamedBays,
			ref: { tagName: 'Bay', id: 'bay-2' },
			expected: { tagName: 'Bay', id: 'bay-2' },
		},

		'a named level chosen above the first named one: it is the scope': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="sub-1">
						<VoltageLevel name="V1" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'VoltageLevel', id: 'vl-1' },
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
		},

		'the TEMPLATE voltage level chosen: walked down to the one bay it holds': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
						<VoltageLevel name="V2" ${id}="vl-2">
							<Bay name="B2" ${id}="bay-2"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'VoltageLevel', id: 'vl-1' },
			expected: { tagName: 'Bay', id: 'bay-1' },
		},

		'a named bay beside a TEMPLATE one: the named bay is the unit': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="TEMPLATE" ${id}="bay-1"/>
							<Bay name="B2" ${id}="bay-2"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Bay', id: 'bay-2' },
		},

		'two named voltage levels beside a TEMPLATE one, none chosen: refused with both': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
						<VoltageLevel name="HV" ${id}="vl-2"/>
						<VoltageLevel name="MV" ${id}="vl-3"/>
					</Substation>
				</SCL>
			`,
			expectedRefusal: {
				key: 'SSD_SCOPE_AMBIGUOUS',
				candidates: [
					{ tagName: 'VoltageLevel', id: 'vl-2', name: 'HV' },
					{ tagName: 'VoltageLevel', id: 'vl-3', name: 'MV' },
				],
			},
		},

		'an element the file does not hold chosen: no scope': {
			sourceXml: twoNamedBays,
			ref: { tagName: 'Bay', id: 'absent' },
			expected: undefined,
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const resolved = resolveSsdScope(source.query, { ref: testCase.ref })
		if (testCase.expectedRefusal) {
			const refusal = toDialecteError(await resolved.catch((error: unknown) => error))
			expect({ key: refusal?.key, candidates: refusal?.meta?.candidates }).toEqual(
				testCase.expectedRefusal,
			)
		} else {
			expect(await resolved).toEqual(testCase.expected)
		}
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
