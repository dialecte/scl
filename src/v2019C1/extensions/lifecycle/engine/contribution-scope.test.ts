import { findOutOfScopeReferences, resolveContributionScope } from './contribution-scope'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

// The scope of a placement is what it places, but what is left out; a reference of a shared element naming anything
// outside it is left out of what the placement writes.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const protection = { tagName: 'Function', id: 'protection-s' } as Scl.Ref<Scl.ElementsOf>
const behaviour = { tagName: 'BehaviorDescription', id: 'behaviour-s' } as Scl.Ref<Scl.ElementsOf>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="source">
		<Substation name="TEMPLATE" uuid="substation-source" ${id}="substation-s">
			<Private type="eIEC61850-6-100" ${id}="private-s">
				<eIEC61850-6-100:BehaviorDescription name="BD1" uuid="behaviour-source" ${id}="behaviour-s">
					<eIEC61850-6-100:InputVar varName="in1" lnodeUuid="lnode-source" ${id}="input-placed-s"/>
					<eIEC61850-6-100:InputVar varName="in2" lnodeUuid="lnode-source" inputUuid="other-source" ${id}="input-half-s"/>
					<eIEC61850-6-100:InputVar varName="in3" lnodeUuid="trip-lnode-source" ${id}="input-left-out-s"/>
				</eIEC61850-6-100:BehaviorDescription>
			</Private>
			<Function name="Prot" uuid="protection-source" ${id}="protection-s">
				<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="lnode-source" ${id}="lnode-s"/>
				<SubFunction name="Trip" uuid="trip-source" ${id}="trip-s">
					<LNode iedName="None" lnClass="PTRC" lnInst="2" uuid="trip-lnode-source" ${id}="trip-lnode-s"/>
				</SubFunction>
			</Function>
			<Function name="Other" uuid="other-source" ${id}="other-s"/>
		</Substation>
	</SCL>
`

/** The scope reads uuids only: an input's second uuid names an element of another function, of whatever kind. */
const HALF_NAMED_INPUT =
	'the second input names an element of another function: the scope reads its uuid, not its kind'

type TestCase = SclTest.BaseXmlTestCase & {
	roots: Scl.Ref<Scl.ElementsOf>[]
	leftOut?: string[]
	omit?: string[]
	expected: {
		/** The scope, by uuid, sorted. */
		scope: string[]
		/** The behaviour description's inputs left out, by record id, sorted. */
		outOfScope: string[]
	}
}

describe('contribution scope', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a function placed → it and what it holds; an input naming anything else is out, even half of one':
			{
				sourceXml,
				allowIncoherentReferences: HALF_NAMED_INPUT,
				roots: [protection],
				expected: {
					scope: ['lnode-source', 'protection-source', 'trip-lnode-source', 'trip-source'],
					outOfScope: ['input-half-s'],
				},
			},
		'its subfunction left out → neither it nor what it holds, and the input naming it is out': {
			sourceXml,
			allowIncoherentReferences: HALF_NAMED_INPUT,
			roots: [protection],
			leftOut: ['trip-s'],
			expected: {
				scope: ['lnode-source', 'protection-source'],
				outOfScope: ['input-half-s', 'input-left-out-s'],
			},
		},
		'the inputs under an omitted tag → not walked': {
			sourceXml,
			allowIncoherentReferences: HALF_NAMED_INPUT,
			roots: [],
			omit: ['InputVar'],
			expected: { scope: [], outOfScope: [] },
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const scope = await resolveContributionScope(source.query, {
			roots: testCase.roots,
			leftOut: new Set(testCase.leftOut ?? []),
		})
		expect([...scope].sort(), 'scope').toEqual(testCase.expected.scope)
		const outOfScope = await findOutOfScopeReferences(source.query, {
			root: behaviour,
			scope,
			omit: testCase.omit,
		})
		expect([...outOfScope].sort(), 'out of scope').toEqual(testCase.expected.outOfScope)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
