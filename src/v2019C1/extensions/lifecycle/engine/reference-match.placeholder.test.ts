import { placeholderLineageOf } from './reference-match'
import { readTargetLineages } from './target-lineages'

import { describe, expect } from 'vitest'

import { REFERENCE_TAG_NAMES } from '@/v2019C1/constants/reference-pairs'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'
import type { AnyTreeRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('placeholderLineageOf under the uuid key', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		placeholder: string
		expected: string | undefined
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a FunctionRef naming a flagged uuid a function carries → that uuid': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1" ${id}="sub">
						<Private type="eIEC61850-6-100" ${id}="private">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/F1" functionUuid="fn-uuid" ${id}="function-ref"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<Function name="F1" uuid="fn-uuid" ${id}="fn"/>
					</Substation>
				</SCL>
			`,
			placeholder: 'fn-uuid',
			expected: 'fn-uuid',
		},
		'a FunctionRef naming a flagged uuid no element carries → none': {
			allowIncoherentReferences:
				'the reference names a uuid no element carries: what the case reads',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl">
					<Substation name="S1" ${id}="sub">
						<Private type="eIEC61850-6-100" ${id}="private">
							<eIEC61850-6-100:AllocationRole name="Operator" uuid="role-uuid" ${id}="role">
								<eIEC61850-6-100:FunctionRef function="S1/F1" functionUuid="dangling-uuid" ${id}="function-ref"/>
							</eIEC61850-6-100:AllocationRole>
						</Private>
						<!-- no element carries dangling-uuid -->
					</Substation>
				</SCL>
			`,
			placeholder: 'dangling-uuid',
			expected: undefined,
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const role = (await source.query.any.getTree({
			tagName: 'AllocationRole',
			id: 'role',
		})) as AnyTreeRecord
		const functionRef = role.tree.find((child) => child.tagName === 'FunctionRef') as AnyTreeRecord
		const targetLineages = await readTargetLineages(source.query, {
			nodes: [role],
			matchKey: 'uuid',
			referrerTags: REFERENCE_TAG_NAMES,
		})
		const lineage = await placeholderLineageOf(source.query, functionRef, {
			placeholderLineages: new Set([testCase.placeholder]),
			targetLineages,
		})
		expect(lineage).toBe(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
