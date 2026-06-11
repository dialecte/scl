import { buildMappedLNodePath } from './build-mapped-lnode-path'

import { describe, expect, test } from 'vitest'

import type { MappedLNodeAttributes } from './build-mapped-lnode-path'

type TestCase = {
	attrs: MappedLNodeAttributes
	expected: string | null
}

describe('buildMappedLNodePath', () => {
	const testCases: Record<string, TestCase> = {
		'mapped LNode without prefix → IED/LDevice/LN path': {
			attrs: { iedName: 'IED1', ldInst: 'LD0', prefix: '', lnClass: 'XCBR', lnInst: '1' },
			expected: 'IED1/LD0/XCBR1',
		},
		'mapped LNode with prefix → prefix prepended to LN segment': {
			attrs: { iedName: 'IED1', ldInst: 'CTRL', prefix: 'P', lnClass: 'CSWI', lnInst: '2' },
			expected: 'IED1/CTRL/PCSWI2',
		},
		'missing prefix attribute → treated as empty': {
			attrs: { iedName: 'IED1', ldInst: 'LD0', lnClass: 'MMXU', lnInst: '1' },
			expected: 'IED1/LD0/MMXU1',
		},
		'unmapped LNode (iedName "None") → null': {
			attrs: { iedName: 'None', ldInst: 'LD0', prefix: '', lnClass: 'XCBR', lnInst: '1' },
			expected: null,
		},
		'empty iedName → null': {
			attrs: { iedName: '', ldInst: 'LD0', lnClass: 'XCBR', lnInst: '1' },
			expected: null,
		},
		'missing iedName → null': {
			attrs: { ldInst: 'LD0', lnClass: 'XCBR', lnInst: '1' },
			expected: null,
		},
		'missing ldInst → null': {
			attrs: { iedName: 'IED1', lnClass: 'XCBR', lnInst: '1' },
			expected: null,
		},
		'missing lnClass → null': {
			attrs: { iedName: 'IED1', ldInst: 'LD0', lnInst: '1' },
			expected: null,
		},
	}

	for (const [name, { attrs, expected }] of Object.entries(testCases)) {
		test(name, () => {
			expect(buildMappedLNodePath(attrs)).toBe(expected)
		})
	}
})
