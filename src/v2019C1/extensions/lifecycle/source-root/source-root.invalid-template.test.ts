import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SourceRoot } from './source-root.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & { expected: SourceRoot<'ssd'> }

/** A template whose scaffolding holds two elements named TEMPLATE side by side is not a valid file. */
describe('query.lifecycle.sourceRoot.ssd - a scaffolding holding two elements named TEMPLATE', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two substations named TEMPLATE → none: not a valid file, the verbs refuse it': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="substation-1">
						<VoltageLevel name="V1" ${id}="voltage-level-1"/>
					</Substation>
					<Substation name="TEMPLATE" ${id}="substation-2">
						<VoltageLevel name="V2" ${id}="voltage-level-2"/>
					</Substation>
				</SCL>
			`,
			expected: { kind: 'none' },
		},
	}

	async function act({ source, testCase }: SclTest.ActParams<TestCase>): Promise<void> {
		await expect(source.query.lifecycle.sourceRoot.ssd()).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
