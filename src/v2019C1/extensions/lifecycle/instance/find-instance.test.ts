import { findInstancesByTemplateUuid, scopeToTargetInstance } from './find-instance'

import { describe, expect, it } from 'vitest'

import { resolveIdentity } from '@/v2019C1/extensions/identity/query'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { TargetInstances } from './instance.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" uuid="sub-uuid" ${id}="sub-t"/>
		<DataTypeTemplates ${id}="dtt-t">
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-t"/>
			<DOType id="SPS_Type" cdc="SPS" ${id}="dot-t2"/>
		</DataTypeTemplates>
	</SCL>
`

describe('findInstancesByTemplateUuid — schema-driven, no name fallback', () => {
	it('uuid-bearing: a lineage miss is a miss (no name adoption)', async () => {
		const { target } = await createSclTestProject({ sourceXml: targetXml, targetXml })
		if (!target) throw new Error('target')
		// no target Substation carries templateUuid === 'nope'; Substation is uuid-bearing → []
		const found = await findInstancesByTemplateUuid(target.document.query, {
			tagName: 'Substation',
			sourceUuid: 'nope',
		})
		expect(found).toHaveLength(0)
	})

	it('uuid-less: matches by the identityFields tuple (DataTypeTemplates by id)', async () => {
		const { target } = await createSclTestProject({ sourceXml: targetXml, targetXml })
		if (!target) throw new Error('target')
		const sourceIdentity = await resolveIdentity(target.document.query, {
			tagName: 'DOType',
			id: 'dot-t',
		} as Scl.Ref<Scl.ElementsOf>)
		const found = await findInstancesByTemplateUuid(target.document.query, {
			tagName: 'DOType' as Scl.ElementsOf,
			sourceUuid: undefined,
			sourceIdentity,
		})
		expect(found).toHaveLength(1)
		const foundId = found[0]?.attributes.find((attribute) => attribute.name === 'id')?.value
		expect(foundId).toBe('DPC_Type')
	})
})

type ScopeCase = SclTest.BaseXmlTestCase & {
	/** The target instances: one, a list, or none given. */
	targetInstance: TargetInstances | undefined
	/** The record ids of the functions that pass, in order. */
	expected: string[]
}

const twoBaysXml = /* xml */ `
	<SCL ${ns} ${id}="scl">
		<Header id="P" uuid="f0000000-0000-4000-8000-000000000001"/>
		<Substation name="S1" uuid="e0000000-0000-4000-8000-000000000001" ${id}="s1">
			<VoltageLevel name="E1" uuid="e0000000-0000-4000-8000-000000000002" ${id}="e1">
				<Bay name="Q01" uuid="e0000000-0000-4000-8000-000000000003" ${id}="q01">
					<Function name="F1" uuid="e0000000-0000-4000-8000-000000000004" ${id}="f1"/>
					<Function name="F2" uuid="e0000000-0000-4000-8000-000000000005" ${id}="f2"/>
				</Bay>
				<Bay name="Q02" uuid="e0000000-0000-4000-8000-000000000006" ${id}="q02">
					<Function name="F1" uuid="e0000000-0000-4000-8000-000000000007" ${id}="f3"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The multi-instance seam every update and report verb filters through: one instance named keeps itself and what it
// holds (a bay its functions), unchanged by the list form; a list keeps each named and what each holds; an empty list
// keeps none; none given keeps every instance.
describe('scopeToTargetInstance - the instances an operation is scoped to', () => {
	const testCases: SclTest.TestCases<ScopeCase> = {
		'one bay named → the functions it holds': {
			sourceXml: twoBaysXml,
			targetXml: twoBaysXml,
			targetInstance: { tagName: 'Bay', id: 'q01' },
			expected: ['f1', 'f2'],
		},
		'one function named → that function only': {
			sourceXml: twoBaysXml,
			targetXml: twoBaysXml,
			targetInstance: { tagName: 'Function', id: 'f2' },
			expected: ['f2'],
		},
		'a list of a function and a bay → the function and what the bay holds': {
			sourceXml: twoBaysXml,
			targetXml: twoBaysXml,
			targetInstance: [
				{ tagName: 'Function', id: 'f1' },
				{ tagName: 'Bay', id: 'q02' },
			],
			expected: ['f1', 'f3'],
		},
		'an empty list → none': {
			sourceXml: twoBaysXml,
			targetXml: twoBaysXml,
			targetInstance: [],
			expected: [],
		},
		'none given → every instance': {
			sourceXml: twoBaysXml,
			targetXml: twoBaysXml,
			targetInstance: undefined,
			expected: ['f1', 'f2', 'f3'],
		},
	}

	async function act({ target, testCase }: SclTest.ActParams<ScopeCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const instances = ['f1', 'f2', 'f3'].map((recordId) => ({ tagName: 'Function', id: recordId }))
		const scoped = await scopeToTargetInstance(target.query, {
			instances,
			targetInstance: testCase.targetInstance,
		})
		expect(scoped.map((instance) => instance.id)).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
