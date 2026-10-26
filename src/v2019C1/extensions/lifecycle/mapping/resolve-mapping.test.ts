import { findMappingPolicy } from './mapping-policies'
import { resolveMapping } from './resolve-mapping'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ResolvedMapping } from './mapping.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const categoryRef = { tagName: 'FunctionCategory', id: 'category-s' } as Scl.Ref<'FunctionCategory'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="category-source-uuid" ${id}="category-s"/>
			</Private>
		</Substation>
	</SCL>
`

/** A project whose substation Private holds `categories`. */
function projectWith(categories: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Substation name="S1" ${id}="substation-t">
				<Private type="eIEC61850-6-100" ${id}="private-t">
					${categories}
				</Private>
			</Substation>
		</SCL>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	expected: Omit<ResolvedMapping, 'existing'> & { existing?: string }
}

describe('resolveMapping — where a shared element of the template lands', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two project categories made from it, renamed since → neither picked, the consumer chooses': {
			sourceXml,
			targetXml: projectWith(
				`<eIEC61850-6-100:FunctionCategory name="A" uuid="a-uuid" templateUuid="category-source-uuid" ${id}="a"/><eIEC61850-6-100:FunctionCategory name="B" uuid="b-uuid" templateUuid="category-source-uuid" ${id}="b"/>`,
			),
			expected: {
				reason: 'lineage',
				ambiguous: true,
				locked: false,
				projectOwned: false,
				undecided: true,
			},
		},
		'two project categories of its name → neither picked, the consumer chooses': {
			sourceXml,
			targetXml: projectWith(
				`<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="a-uuid" ${id}="a"/><eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="b-uuid" ${id}="b"/>`,
			),
			expected: {
				reason: 'name',
				ambiguous: true,
				locked: false,
				projectOwned: false,
				undecided: true,
			},
		},
		'one project category of its name → mapped onto it, the project own': {
			sourceXml,
			targetXml: projectWith(
				`<eIEC61850-6-100:FunctionCategory name="MEASUREMENT" uuid="a-uuid" ${id}="a"/>`,
			),
			expected: {
				existing: 'a',
				reason: 'name',
				ambiguous: false,
				locked: false,
				projectOwned: true,
				undecided: false,
			},
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const policy = findMappingPolicy('FunctionCategory')
		if (!policy) throw new Error('a category is a shared element')
		const { existing, ...resolved } = await resolveMapping(target.query, {
			sourceQuery: source.query,
			sourceRef: categoryRef,
			policy,
		})
		expect({ ...resolved, ...(existing ? { existing: existing.id } : {}) }).toEqual(
			testCase.expected,
		)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
