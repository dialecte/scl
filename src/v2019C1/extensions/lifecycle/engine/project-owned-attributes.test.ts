import { projectOwnedAttributes } from './project-owned-attributes'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { BoundLogicalNodeTypes } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'

describe('projectOwnedAttributes', () => {
	type TestCase = {
		only?: boolean
		tagName: string
		instanceAttributes: Record<string, string>
		namesFollow: NamesFollow
		/** Whether a bound LNode takes the template's type. Default: not given. */
		boundLogicalNodeTypes?: BoundLogicalNodeTypes
		/** The attributes owned, sorted. */
		owned: string[]
		/** Those listed as kept, `<name> <reason>`, sorted. */
		listedAsKept: string[]
	}

	const testCases: Record<string, TestCase> = {
		"an instance's behaviour description → its file is the project's, listed as configured by the instance":
			{
				tagName: 'BehaviorDescription',
				instanceAttributes: { name: 'Logic', fileReference: 'project-logic.xml', desc: 'd' },
				namesFollow: 'project',
				owned: ['fileReference'],
				listedAsKept: ['fileReference instance-configuration'],
			},
		"an instance's variable → its value is the project's, listed as configured by the instance": {
			tagName: 'Variable',
			instanceAttributes: { name: 'Prefix', value: 'project-value' },
			namesFollow: 'project',
			owned: ['value'],
			listedAsKept: ['value instance-configuration'],
		},
		'a behaviour description of a revision of the same file → nothing owned': {
			tagName: 'BehaviorDescription',
			instanceAttributes: { name: 'Logic', fileReference: 'logic.xml' },
			namesFollow: 'source',
			owned: [],
			listedAsKept: [],
		},
		'a variable of a revision of the same file → nothing owned': {
			tagName: 'Variable',
			instanceAttributes: { name: 'Prefix', value: 'v' },
			namesFollow: 'source',
			owned: [],
			listedAsKept: [],
		},
		'an element configuring nothing → nothing owned': {
			tagName: 'Function',
			instanceAttributes: { name: 'Prot', desc: 'd' },
			namesFollow: 'project',
			owned: [],
			listedAsKept: [],
		},
		'an LNode bound to an IED → its implementation, its type following the template, in a fork too':
			{
				tagName: 'LNode',
				instanceAttributes: { iedName: 'IED1', lnClass: 'CSWI', lnType: 'T1' },
				namesFollow: 'source',
				owned: ['iedName', 'ldInst', 'lnClass', 'lnInst', 'lnUuid', 'prefix'],
				listedAsKept: [],
			},
		'an LNode bound to an IED, its type said to follow → its implementation only': {
			tagName: 'LNode',
			instanceAttributes: { iedName: 'IED1', lnClass: 'CSWI', lnType: 'T1' },
			namesFollow: 'project',
			boundLogicalNodeTypes: 'follow',
			owned: ['iedName', 'ldInst', 'lnClass', 'lnInst', 'lnUuid', 'prefix'],
			listedAsKept: [],
		},
		'an LNode bound to an IED, its type kept → its implementation and type, the type listed as kept':
			{
				tagName: 'LNode',
				instanceAttributes: { iedName: 'IED1', lnClass: 'CSWI', lnType: 'T1' },
				namesFollow: 'project',
				boundLogicalNodeTypes: 'keep',
				owned: ['iedName', 'ldInst', 'lnClass', 'lnInst', 'lnType', 'lnUuid', 'prefix'],
				listedAsKept: ['lnType bound-logical-node'],
			},
		'an LNode assigned to no IED, its type kept → nothing owned': {
			tagName: 'LNode',
			instanceAttributes: { iedName: 'None', lnClass: 'CSWI', lnType: 'T1' },
			namesFollow: 'project',
			boundLogicalNodeTypes: 'keep',
			owned: [],
			listedAsKept: [],
		},
		'an LNode assigned to no IED → nothing owned': {
			tagName: 'LNode',
			instanceAttributes: { iedName: 'None', lnClass: 'CSWI', lnType: 'T1' },
			namesFollow: 'project',
			owned: [],
			listedAsKept: [],
		},
	}

	function act(testCase: TestCase): void {
		const { attributes, listedAsKept } = projectOwnedAttributes({
			tagName: testCase.tagName,
			instanceAttributes: testCase.instanceAttributes,
			namesFollow: testCase.namesFollow,
			boundLogicalNodeTypes: testCase.boundLogicalNodeTypes,
		})
		expect([...attributes].sort()).toEqual(testCase.owned)
		expect([...listedAsKept].map(([name, reason]) => `${name} ${reason}`).sort()).toEqual(
			testCase.listedAsKept,
		)
	}

	runSclTestCases.generic(testCases, act)
})
