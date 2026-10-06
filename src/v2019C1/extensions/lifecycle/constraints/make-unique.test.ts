import { makeUnique } from './make-unique'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { PlacementResolution } from './resolve-placement-collision.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A bay holding `names` as functions; the last one is the element made unique. */
function bayWith(names: string[]): string {
	const functions = names
		.map(
			(name, index) =>
				`<Function name="${name}" uuid="function-${index}" ${id}="function-${index}"/>`,
		)
		.join('\n')
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="substation">
				<VoltageLevel name="V1" ${id}="voltage-level">
					<Bay name="B1" ${id}="bay">
						${functions}
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	/** The record id of the function made unique. */
	functionId: string
	expected: PlacementResolution
}

describe("makeUnique — an element gets a value free where it sits, in the engine's one numbering", () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a function named like another of its bay -> numbered _1': {
			sourceXml: bayWith(['HMI_Fn', 'HMI_Fn']),
			functionId: 'function-1',
			expected: { status: 'resolved', attr: 'name', from: 'HMI_Fn', to: 'HMI_Fn_1' },
			expectedQueries: [
				'//default:Bay/default:Function[@name="HMI_Fn"]',
				'//default:Bay/default:Function[@name="HMI_Fn_1"]',
			],
		},
		'a numbered name taken -> the next number, never a second one': {
			sourceXml: bayWith(['HMI_Fn_1', 'HMI_Fn_1']),
			functionId: 'function-1',
			expected: { status: 'resolved', attr: 'name', from: 'HMI_Fn_1', to: 'HMI_Fn_2' },
			expectedQueries: ['//default:Bay/default:Function[@name="HMI_Fn_2"]'],
			unexpectedQueries: ['//default:Bay/default:Function[@name="HMI_Fn_1_1"]'],
		},
		'a name free in its bay -> left as it is': {
			sourceXml: bayWith(['Prot', 'HMI_Fn']),
			functionId: 'function-1',
			expected: { status: 'ok' },
			expectedQueries: ['//default:Bay/default:Function[@name="HMI_Fn"]'],
			unexpectedQueries: ['//default:Bay/default:Function[@name="HMI_Fn_1"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const ref = { tagName: 'Function', id: testCase.functionId } as Scl.Ref<Scl.ElementsOf>
		await source.transaction(async (tx) => {
			const resolution = await makeUnique(tx, { ref })
			expect(resolution).toEqual(testCase.expected)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
