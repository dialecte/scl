import { resolvePlaceholderLineages } from './placeholder-lineages'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ReferencesByName } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

// The lineages a reference may pair by name on: none unless asked, else those the identity check flags as
// placeholders — a value on elements of several types, or naming an element of another type; a duplicated uuid is no
// lineage.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const CROSS_TYPE = '11111111-1111-4111-8111-111111111111'
const TYPE_MISMATCH = '22222222-2222-4222-8222-222222222222'
const DUPLICATED = '33333333-3333-4333-8333-333333333333'

const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" templateUuid="${CROSS_TYPE}" ${id}="substation-t">
			<Private type="eIEC61850-6-100" ${id}="private-t">
				<eIEC61850-6-100:AllocationRole name="PIU" uuid="role-project" templateUuid="${TYPE_MISMATCH}" ${id}="role-t"/>
			</Private>
			<Function name="Prot" uuid="${TYPE_MISMATCH}" templateUuid="${CROSS_TYPE}" ${id}="protection-t"/>
			<Function name="Ctrl" uuid="${DUPLICATED}" ${id}="control-t"/>
			<Function name="Meas" uuid="${DUPLICATED}" ${id}="measurement-t"/>
		</Substation>
	</SCL>
`

type TestCase = SclTest.BaseXmlTestCase & {
	referencesByName?: ReferencesByName
	expected: string[]
}

describe('placeholder lineages', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'nothing asked → none': { sourceXml: projectXml, expected: [] },
		'never → none': { sourceXml: projectXml, referencesByName: 'never', expected: [] },
		'placeholders → the flagged lineages, not a duplicated uuid': {
			sourceXml: projectXml,
			referencesByName: 'placeholders',
			expected: [CROSS_TYPE, TYPE_MISMATCH],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const lineages = await resolvePlaceholderLineages(source.query, {
			referencesByName: testCase.referencesByName,
		})
		expect([...lineages].sort()).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// A value shared by the function forms is the lineage of one template placed several ways: no placeholder, nothing to
// pair by name on. The same value on a function and a logical node still is.
const FUNCTION_FAMILY = '44444444-4444-4444-8444-444444444444'

function familyProjectXml(params: { lnodeXml?: string }): string {
	const { lnodeXml = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="project">
			<Substation name="S1" ${id}="substation-t">
				<VoltageLevel name="V1" ${id}="voltage-level-t">
					<Bay name="B1" ${id}="bay-t">
						<Function name="Prot" uuid="function-project" templateUuid="${FUNCTION_FAMILY}" ${id}="function-t">
							${lnodeXml}
							<SubFunction name="Trip" uuid="sub-function-project" templateUuid="${FUNCTION_FAMILY}" ${id}="sub-function-t"/>
						</Function>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

describe('placeholder lineages — the function forms are one type', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a value shared by a function and a subfunction -> not flagged': {
			sourceXml: familyProjectXml({}),
			referencesByName: 'placeholders',
			expected: [],
		},
		'a value shared by a function, a subfunction and a logical node -> flagged': {
			sourceXml: familyProjectXml({
				lnodeXml: `<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="lnode-project" templateUuid="${FUNCTION_FAMILY}" ${id}="lnode-t"/>`,
			}),
			referencesByName: 'placeholders',
			expected: [FUNCTION_FAMILY],
		},
		'a value shared by a function and a subfunction, naming a logical node -> flagged': {
			sourceXml: familyProjectXml({
				lnodeXml: `<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="${FUNCTION_FAMILY}" ${id}="lnode-t"/>`,
			}),
			referencesByName: 'placeholders',
			expected: [FUNCTION_FAMILY],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const lineages = await resolvePlaceholderLineages(source.query, {
			referencesByName: testCase.referencesByName,
		})
		expect([...lineages].sort()).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
