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
