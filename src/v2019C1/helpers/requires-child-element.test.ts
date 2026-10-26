import { requiredChildTags, requiresChildElement } from './requires-child-element'

import { describe, expect, it } from 'vitest'

import type { Particle } from '@dialecte/core'

type TestCase = {
	particle: Particle | undefined
	/** Whether the content model needs a child element. */
	requires: boolean
	/** The element kinds it needs at least one of; `''` for any element. */
	required: string[]
}

const optional: Particle = { kind: 'element', name: 'Text' }
const reference: Particle = { kind: 'element', name: 'FunctionCatRef', minOccurs: 1 }
const relation: Particle = { kind: 'element', name: 'PowerSystemRelation', minOccurs: 2 }

const testCases: Record<string, TestCase> = {
	'no content model: nothing needed': { particle: undefined, requires: false, required: [] },
	'an optional element: nothing needed': { particle: optional, requires: false, required: [] },
	'a required element': { particle: reference, requires: true, required: ['FunctionCatRef'] },
	'a required wildcard': {
		particle: { kind: 'any', minOccurs: 1, processContents: 'lax' },
		requires: true,
		required: [''],
	},
	'a required sequence of an optional and a required element': {
		particle: { kind: 'sequence', minOccurs: 1, particles: [optional, reference] },
		requires: true,
		required: ['FunctionCatRef'],
	},
	'an optional sequence holding a required element': {
		particle: { kind: 'sequence', particles: [reference] },
		requires: false,
		required: [],
	},
	'a required choice whose branches each need an element': {
		particle: { kind: 'choice', minOccurs: 1, particles: [relation, reference] },
		requires: true,
		required: ['PowerSystemRelation', 'FunctionCatRef'],
	},
	'a required choice with an optional branch: nothing needed': {
		particle: { kind: 'choice', minOccurs: 1, particles: [optional, reference] },
		requires: false,
		required: ['FunctionCatRef'],
	},
	'a required choice with no branch: nothing needed': {
		particle: { kind: 'choice', minOccurs: 1, particles: [] },
		requires: false,
		required: [],
	},
	'a required sequence with no particle: nothing needed': {
		particle: { kind: 'sequence', minOccurs: 1, particles: [] },
		requires: false,
		required: [],
	},
}

describe('the children a content model needs', () => {
	for (const [name, testCase] of Object.entries(testCases)) {
		it(name, function readTheContentModel() {
			expect(requiresChildElement(testCase.particle)).toBe(testCase.requires)
			expect([...requiredChildTags(testCase.particle)]).toEqual(testCase.required)
		})
	}
})
