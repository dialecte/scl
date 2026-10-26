import { isEmptiableContainer } from './emptiable-container'
import { CHILD_REQUIRED_TAGS, NAMESPACE_WRAPPER_TYPES } from './pruned-when-empty.constants'

import { describe, expect, it } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { AnyDefinition } from '@dialecte/core'

const DEFINITION: AnyDefinition = SCL_DIALECTE_CONFIG.definition

/** A definition of the SCL one, its attributes replaced. */
function withAttributes(params: {
	tagName: string
	sequence: string[]
	identityFields?: string[]
}): AnyDefinition[string] {
	const { tagName, sequence, identityFields } = params
	const definition = DEFINITION[tagName]
	return {
		...definition,
		attributes: {
			...definition.attributes,
			sequence,
			details: {},
			identityFields: identityFields ?? [],
		},
	}
}

const testCases: Record<
	string,
	{ tagName: string; definition?: AnyDefinition[string]; expected: boolean }
> = {
	'a list with no identity (PowerSystemRelations)': {
		tagName: 'PowerSystemRelations',
		expected: true,
	},
	'a list with no identity (ProcessResources)': { tagName: 'ProcessResources', expected: true },
	'a set of references with an identity (FunctionCategory)': {
		tagName: 'FunctionCategory',
		expected: true,
	},
	'a set of references (Variable)': { tagName: 'Variable', expected: true },
	'an element of its own needing a child that is no reference (IED)': {
		tagName: 'IED',
		expected: false,
	},
	'a type needing its data objects (LNodeType)': { tagName: 'LNodeType', expected: false },
	'an application needing a role': { tagName: 'Application', expected: false },
	'a level of the topology needing a bay (VoltageLevel)': {
		tagName: 'VoltageLevel',
		expected: false,
	},
	'an element needing no child (Bay)': { tagName: 'Bay', expected: false },
	'needing no reference, carrying a uuid but no key': {
		tagName: 'Application',
		definition: withAttributes({ tagName: 'Application', sequence: ['uuid'] }),
		expected: false,
	},
	'needing no reference, carrying a key but no uuid': {
		tagName: 'Application',
		definition: withAttributes({
			tagName: 'Application',
			sequence: ['name'],
			identityFields: ['name'],
		}),
		expected: false,
	},
	'needing a reference and an element of another kind, with a key': {
		tagName: 'FunctionCategory',
		definition: {
			...DEFINITION.FunctionCategory,
			contentModel: {
				kind: 'sequence',
				minOccurs: 1,
				particles: [
					{ kind: 'element', name: 'FunctionCatRef', minOccurs: 1 },
					{ kind: 'element', name: 'SubCategory', minOccurs: 1 },
				],
			},
		},
		expected: false,
	},
	'needing no reference, with neither key nor uuid': {
		tagName: 'Application',
		definition: withAttributes({ tagName: 'Application', sequence: ['desc'] }),
		expected: true,
	},
}

describe('a container with no reason to stay once it holds none of the children it needs', () => {
	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, function judgeTheDefinition() {
			const definition = testCase.definition ?? DEFINITION[testCase.tagName]
			expect(isEmptiableContainer({ tagName: testCase.tagName, definition })).toBe(
				testCase.expected,
			)
		})
	}

	it('the tags read from the definition', function readTheDefinition() {
		expect([...CHILD_REQUIRED_TAGS].sort()).toEqual([
			'Address',
			'Communication',
			'DataTypeTemplates',
			'FunctionCategory',
			'History',
			'Inputs',
			'LNodeInputs',
			'LNodeOutputs',
			'Labels',
			'Outputs',
			'PowerSystemRelations',
			'ProcessResources',
			'SCL',
			'SMVSettings',
			'Server',
			'SubCategory',
			'Variable',
		])
	})

	it('the wrapper types of the dialecte: its namespaces but the default one', function readTheNamespaces() {
		expect([...NAMESPACE_WRAPPER_TYPES].sort()).toEqual(['eIEC61850-6-100', 'xsi'])
	})
})
