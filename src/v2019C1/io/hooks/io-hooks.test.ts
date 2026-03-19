import { createSclIoHooks, ensureUuid } from './io-hooks'

import { describe, it, expect } from 'vitest'

import { Scl, SCL_NAMESPACES } from '@/v2019C1/config'

import type { AnyRawRecord } from '@dialecte/core'

describe('createSclIoHooks', () => {
	type TestCase = {
		records: Array<{ tagName: Scl.ElementsOf; attributes?: Record<string, string> }>
		expectedUpdates: number
		expectedWarnings?: number
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'no records → 0 updates, 0 warnings': {
			records: [],
			expectedUpdates: 0,
		},
		'target only, no reference → 0 updates, 0 warnings': {
			records: [{ tagName: 'Function', attributes: { name: 'F1', uuid: 'uuid-f1' } }],
			expectedUpdates: 0,
		},
		'reference only, no indexed target → 0 updates, 1 warning': {
			records: [{ tagName: 'FunctionRef', attributes: { function: 'F1' } }],
			expectedUpdates: 0,
			expectedWarnings: 1,
		},
		'target then reference with matching path → 1 update, 0 warnings': {
			records: [
				{ tagName: 'Function', attributes: { name: 'F1', uuid: 'uuid-f1' } },
				{ tagName: 'FunctionRef', attributes: { function: 'F1' } },
			],
			expectedUpdates: 1,
		},
		'reference already has uuid attribute → 0 updates, 0 warnings': {
			records: [
				{ tagName: 'Function', attributes: { name: 'F1', uuid: 'uuid-f1' } },
				{ tagName: 'FunctionRef', attributes: { function: 'F1', functionUuid: 'uuid-f1' } },
			],
			expectedUpdates: 0,
		},
		'VariableApplyTo with XPath element → 0 updates, 1 warning': {
			records: [
				{
					tagName: 'VariableApplyTo',
					attributes: { element: './/LNode//LNodeSpecNaming', attribute: 'sLdInst' },
				},
			],
			expectedUpdates: 0,
			expectedWarnings: 1,
		},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, async () => {
			const hooks = createSclIoHooks()

			for (const { tagName, attributes } of testCase.records) {
				hooks.beforeImportRecord!({
					record: makeRecord(tagName, attributes),
					ancestry: [],
				})
			}

			const first = await hooks.afterImport!()
			expect(first.updates ?? []).toHaveLength(testCase.expectedUpdates)
			expect(first.warnings ?? []).toHaveLength(testCase.expectedWarnings ?? 0)

			// State is always cleared after afterImport
			const second = await hooks.afterImport!()
			expect(second.updates ?? []).toHaveLength(0)
			expect(second.warnings ?? []).toHaveLength(0)
		})
	})

	it('VariableApplyTo emits unsupported-xpath-reference warning with correct details', async () => {
		const hooks = createSclIoHooks()
		const record = makeRecord('VariableApplyTo', {
			element: './/LNode//LNodeSpecNaming',
			attribute: 'sLdInst',
		})

		hooks.beforeImportRecord!({ record, ancestry: [] })

		const result = await hooks.afterImport!()
		expect(result.updates ?? []).toHaveLength(0)
		expect(result.warnings).toHaveLength(1)

		const warning = result.warnings![0]
		expect(warning.type).toBe('unsupported-xpath-reference')
		expect(warning.recordId).toBe(record.id)
		expect(warning.details).toEqual({
			elementTag: 'VariableApplyTo',
			pathAttribute: 'element',
			uuidAttribute: 'elementUuid',
			pathValue: './/LNode//LNodeSpecNaming',
		})
	})
})

describe('ensureUuid', () => {
	type TestCase = {
		record: AnyRawRecord
		expectedResult: 'existing' | 'generated' | 'undefined'
		existingUuid?: string
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'element with existing uuid → existing uuid returned': {
			record: makeRecord('Function', { name: 'F1', uuid: 'existing-uuid-1' }),
			expectedResult: 'existing',
			existingUuid: 'existing-uuid-1',
		},
		'element supporting uuid but missing it → uuid generated and added': {
			record: makeRecord('Bay', { name: 'B1' }),
			expectedResult: 'generated',
		},
		'element not supporting uuid → undefined returned': {
			record: makeRecord('Private', { type: 'custom' }),
			expectedResult: 'undefined',
		},
		'SCL root element → undefined returned': {
			record: makeRecord('SCL'),
			expectedResult: 'undefined',
		},
		'Substation without uuid → uuid generated and added': {
			record: makeRecord('Substation', { name: 'S1' }),
			expectedResult: 'generated',
		},
		'LNode without uuid → uuid generated and added': {
			record: makeRecord('LNode', { lnClass: 'XCBR', lnInst: '1' }),
			expectedResult: 'generated',
		},
		'IED with existing uuid → existing uuid returned': {
			record: makeRecord('IED', { name: 'IED1', uuid: 'ied-uuid-1' }),
			expectedResult: 'existing',
			existingUuid: 'ied-uuid-1',
		},
		'DataTypeTemplates → undefined returned': {
			record: makeRecord('DataTypeTemplates'),
			expectedResult: 'undefined',
		},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, tc]) => tc.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, tc]) => {
		it(description, () => {
			const result = ensureUuid(tc.record)

			if (tc.expectedResult === 'existing') {
				expect(result).toBe(tc.existingUuid)
			} else if (tc.expectedResult === 'generated') {
				expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
				expect(tc.record.attributes.find((a) => a.name === 'uuid')?.value).toBe(result)
			} else {
				expect(result).toBeUndefined()
				expect(tc.record.attributes.find((a) => a.name === 'uuid')).toBeUndefined()
			}
		})
	})

	it('element without uuid → calling twice returns same uuid and no duplicate attribute', () => {
		const record = makeRecord('Function', { name: 'F1' })
		const first = ensureUuid(record)
		const second = ensureUuid(record)
		expect(first).toBe(second)
		expect(record.attributes.filter((a) => a.name === 'uuid')).toHaveLength(1)
	})
})

// ── Helpers ──────────────────────────────────────────────────────────

function makeRecord(tagName: string, attributes: Record<string, string> = {}): AnyRawRecord {
	return {
		id: crypto.randomUUID(),
		tagName,
		namespace: SCL_NAMESPACES.default,
		attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
		value: '',
		parent: null,
		children: [],
	}
}
