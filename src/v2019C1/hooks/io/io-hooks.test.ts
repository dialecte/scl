import { createSclIoHooks } from './io-hooks'

import { describe, it, expect } from 'vitest'

import { Scl, SCL_NAMESPACES } from '@/v2019C1/config'

import type { AnyRawRecord } from '@dialecte/core'

describe('createSclIoHooks', () => {
	type TestCase = {
		records: Array<{ tagName: Scl.ElementsOf; attributes?: Record<string, string> }>
		expectedUpdates?: Array<{ attributes: Array<{ name: string; value: string }> }>
		expectedWarnings?: Array<{ type: string }>
		only?: boolean
	}

	const testCases: Record<string, TestCase> = {
		'no records → 0 updates, 0 warnings': {
			records: [],
		},
		'target only, no reference → 0 updates, 0 warnings': {
			records: [{ tagName: 'Function', attributes: { name: 'F1', uuid: 'uuid-f1' } }],
		},
		'reference only, no indexed target → 0 updates, 1 warning': {
			records: [{ tagName: 'FunctionRef', attributes: { function: 'F1' } }],
			expectedWarnings: [{ type: 'unresolved-reference' }],
		},
		'target then reference with matching path → 1 update, 0 warnings': {
			records: [
				{ tagName: 'Function', attributes: { name: 'F1', uuid: 'uuid-f1' } },
				{ tagName: 'FunctionRef', attributes: { function: 'F1' } },
			],
			expectedUpdates: [{ attributes: [{ name: 'functionUuid', value: 'uuid-f1' }] }],
		},
		'reference already has uuid attribute → 0 updates, 0 warnings': {
			records: [
				{ tagName: 'Function', attributes: { name: 'F1', uuid: 'uuid-f1' } },
				{ tagName: 'FunctionRef', attributes: { function: 'F1', functionUuid: 'uuid-f1' } },
			],
		},
		'VariableApplyTo with XPath element → 0 updates, 1 warning': {
			records: [
				{
					tagName: 'VariableApplyTo',
					attributes: { element: './/LNode//LNodeSpecNaming', attribute: 'sLdInst' },
				},
			],
			expectedWarnings: [{ type: 'unsupported-xpath-reference' }],
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
			expect(first.updates?.map((u) => ({ attributes: u.attributes })) ?? []).toEqual(
				testCase.expectedUpdates ?? [],
			)
			expect(first.warnings?.map((w) => ({ type: w.type })) ?? []).toEqual(
				testCase.expectedWarnings ?? [],
			)

			// State is always cleared after afterImport
			const second = await hooks.afterImport!()
			expect(second.updates ?? []).toEqual([])
			expect(second.warnings ?? []).toEqual([])
		})
	})

	it('VariableApplyTo with XPath element → warning with full details and correct recordId', async () => {
		const hooks = createSclIoHooks()
		const record = makeRecord('VariableApplyTo', {
			element: './/LNode//LNodeSpecNaming',
			attribute: 'sLdInst',
		})

		hooks.beforeImportRecord!({ record, ancestry: [] })

		const result = await hooks.afterImport!()
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

	it('DOS with another DO name under a mapped LNode → uuid added, no warning', async () => {
		const hooks = createSclIoHooks()
		const lnode = makeRecord('LNode', { lnClass: 'PTOC', lnInst: '1', lnUuid: 'ptoc1-uuid' })
		const dos = makeRecord('DOS', { name: 'Mod', mappedDoName: 'Health' })

		hooks.beforeImportRecord!({ record: dos, ancestry: [lnode] })
		hooks.beforeImportRecord!({ record: lnode, ancestry: [] })
		hooks.beforeImportRecord!({ record: makeRecord('LN', { uuid: 'ptoc1-uuid' }), ancestry: [] })

		const result = await hooks.afterImport!()
		expect(result.warnings ?? []).toEqual([])
		expect(result.updates).toEqual([
			{
				recordId: dos.id,
				attributes: [
					{ name: 'mappedDoName', value: 'Health' },
					{ name: 'mappedLnUuid', value: 'ptoc1-uuid' },
				],
			},
		])
	})

	it('DOS with an absolute reference to a logical node absent from the file → unresolved warning', async () => {
		const hooks = createSclIoHooks()
		const lnode = makeRecord('LNode', { lnClass: 'PTOC', lnInst: '1', lnUuid: 'ptoc1-uuid' })
		const dos = makeRecord('DOS', { name: 'Op', mappedDoName: 'OTHER/LD0/GGIO9.Ind2' })

		hooks.beforeImportRecord!({ record: dos, ancestry: [lnode] })
		hooks.beforeImportRecord!({ record: lnode, ancestry: [] })
		hooks.beforeImportRecord!({ record: makeRecord('LN', { uuid: 'ptoc1-uuid' }), ancestry: [] })

		const result = await hooks.afterImport!()
		expect(result.updates ?? []).toEqual([])
		expect(
			result.warnings?.map((warning) => ({ type: warning.type, recordId: warning.recordId })),
		).toEqual([{ type: 'unresolved-reference', recordId: dos.id }])
	})

	it('DOS whose absolute name names another LN than its uuid → uuid wins, incoherent-reference warning', async () => {
		const hooks = createSclIoHooks()
		const lnode = makeRecord('LNode', { lnClass: 'PTOC', lnInst: '1', lnUuid: 'ptoc1-uuid' })
		const dos = makeRecord('DOS', {
			name: 'Op',
			mappedDoName: 'VENDOR/LD0/GGIO1.Ind2',
			mappedLnUuid: 'ptoc1-uuid',
		})
		const ied = makeRecord('IED', { name: 'VENDOR' })
		const accessPoint = makeRecord('AccessPoint', { name: 'AP1' })
		const server = makeRecord('Server')
		const ldevice = makeRecord('LDevice', { inst: 'LD0' })
		const iedAncestry = [ied, accessPoint, server, ldevice]

		hooks.beforeImportRecord!({ record: dos, ancestry: [lnode] })
		hooks.beforeImportRecord!({ record: lnode, ancestry: [] })
		hooks.beforeImportRecord!({
			record: makeRecord('LN', { lnClass: 'PTOC', inst: '1', uuid: 'ptoc1-uuid' }),
			ancestry: iedAncestry,
		})
		hooks.beforeImportRecord!({
			record: makeRecord('LN', { lnClass: 'GGIO', inst: '1', uuid: 'ggio1-uuid' }),
			ancestry: iedAncestry,
		})

		const result = await hooks.afterImport!()
		expect(result.updates).toEqual([
			{
				recordId: dos.id,
				attributes: [
					{ name: 'mappedDoName', value: 'Ind2' },
					{ name: 'mappedLnUuid', value: 'ptoc1-uuid' },
				],
			},
		])
		expect(
			result.warnings?.map((warning) => ({ type: warning.type, recordId: warning.recordId })),
		).toEqual([{ type: 'incoherent-reference', recordId: dos.id }])
	})

	it('Function indexed before FunctionRef → FunctionRef resolved with functionUuid', async () => {
		const hooks = createSclIoHooks()
		const refRecord = makeRecord('FunctionRef', { function: 'F1' })

		hooks.beforeImportRecord!({
			record: makeRecord('Function', { name: 'F1', uuid: 'uuid-f1' }),
			ancestry: [],
		})
		hooks.beforeImportRecord!({ record: refRecord, ancestry: [] })

		const result = await hooks.afterImport!()
		expect(result.updates).toHaveLength(1)
		expect(result.updates?.[0].recordId).toBe(refRecord.id)
		expect(result.updates?.[0].attributes).toEqual([{ name: 'functionUuid', value: 'uuid-f1' }])
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
