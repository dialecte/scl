import { createSclIoHooks } from './io-hooks'

import { describe, it, expect } from 'vitest'

import { Scl, SCL_NAMESPACES } from '@/v2019C1/config'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DerivedSpecificationNamingWarning } from '@/v2019C1'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type { AnyRawRecord } from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

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
		hooks.beforeImportRecord!({ record: specNamingOf(lnode), ancestry: [lnode] })
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
		hooks.beforeImportRecord!({ record: specNamingOf(lnode), ancestry: [lnode] })
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
		hooks.beforeImportRecord!({ record: specNamingOf(lnode), ancestry: [lnode] })
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

	it('SourceRef whose extRefAddr names another ExtRef than its uuid, LNode mapped → intAddr alone written, incoherent-reference warning', async () => {
		const hooks = createSclIoHooks()
		const lnode = makeRecord('LNode', {
			iedName: 'IED1',
			ldInst: 'LD0',
			lnClass: 'XCBR',
			lnInst: '1',
			lnUuid: 'xcbr-uuid',
		})
		const inputs = makeRecord('LNodeInputs')
		const sourceRef = makeRecord('SourceRef', {
			input: 'Trip',
			extRefUuid: 'ext-ref-uuid',
			extRefAddr: 'IED1/LD0/XCBR1.Other',
		})
		const ied = makeRecord('IED', { name: 'IED1' })
		const accessPoint = makeRecord('AccessPoint', { name: 'AP1' })
		const server = makeRecord('Server')
		const ldevice = makeRecord('LDevice', { inst: 'LD0' })
		const ln = makeRecord('LN', { lnClass: 'XCBR', inst: '1', uuid: 'xcbr-uuid' })
		const extRef = makeRecord('ExtRef', { intAddr: 'Trip', uuid: 'ext-ref-uuid' })

		hooks.beforeImportRecord!({ record: sourceRef, ancestry: [lnode, inputs] })
		hooks.beforeImportRecord!({ record: specNamingOf(lnode), ancestry: [lnode] })
		hooks.beforeImportRecord!({ record: lnode, ancestry: [] })
		hooks.beforeImportRecord!({
			record: extRef,
			ancestry: [ied, accessPoint, server, ldevice, ln, makeRecord('Inputs')],
		})

		const result = await hooks.afterImport!()
		expect(result.updates).toEqual([
			{ recordId: sourceRef.id, attributes: [{ name: 'extRefAddr', value: 'Trip' }] },
		])
		expect(
			result.warnings?.map((warning) => ({ type: warning.type, recordId: warning.recordId })),
		).toEqual([{ type: 'incoherent-reference', recordId: sourceRef.id }])
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

describe('import warnings for a terminal', () => {
	type TestCase = {
		only?: boolean
		terminal: Record<string, string>
		nodePathName?: string
		expectedWarnings: { type: string; details: Record<string, unknown> }[]
	}

	const L1 = '00000000-0000-4000-8000-000000000001'
	const L2 = '00000000-0000-4000-8000-000000000002'

	const testCases: Record<string, TestCase> = {
		'path, names and uuid agreeing → no warning': {
			terminal: {
				connectivityNode: 'S1/VL1/B1/L1',
				substationName: 'S1',
				voltageLevelName: 'VL1',
				bayName: 'B1',
				cNodeName: 'L1',
				cNodeUuid: L1,
			},
			expectedWarnings: [],
		},
		'names left out → filled, no warning': {
			terminal: { connectivityNode: 'S1/VL1/B1/L1', cNodeName: '' },
			expectedWarnings: [],
		},
		'path naming no node → one unresolved-reference warning': {
			terminal: { connectivityNode: 'S1/VL1/B1/L9', cNodeName: 'L9' },
			expectedWarnings: [
				{
					type: 'unresolved-reference',
					details: {
						elementTag: 'Terminal',
						uuidAttribute: 'cNodeUuid',
						pathValue: 'S1/VL1/B1/L9',
						triedKeys: ['S1/VL1/B1/L9'],
					},
				},
			],
		},
		'path naming the predefined grounded node, not declared → no warning': {
			terminal: { connectivityNode: 'S1/VL1/B1/grounded', cNodeName: 'grounded' },
			expectedWarnings: [],
		},
		'path naming one node, uuid another → one incoherent-reference warning': {
			terminal: { connectivityNode: 'S1/VL1/B1/L1', cNodeName: 'L1', cNodeUuid: L2 },
			expectedWarnings: [
				{
					type: 'incoherent-reference',
					details: {
						elementTag: 'Terminal',
						pathAttribute: 'connectivityNode',
						pathValue: 'S1/VL1/B1/L1',
						uuidAttribute: 'cNodeUuid',
						uuidValue: L2,
					},
				},
			],
		},
		'names of another node → one incoherent-path-names warning listing them': {
			terminal: {
				connectivityNode: 'S1/VL1/B1/L1',
				lineName: 'X',
				bayName: 'B9',
				cNodeName: 'L1',
			},
			expectedWarnings: [
				{
					type: 'incoherent-path-names',
					details: {
						elementTag: 'Terminal',
						attributes: [
							{ name: 'lineName', value: 'X', expected: undefined },
							{ name: 'bayName', value: 'B9', expected: 'B1' },
						],
					},
				},
			],
		},
		'node pathName that is not its position → one incoherent-path-names warning': {
			terminal: { connectivityNode: 'S1/VL1/B1/L1', cNodeName: 'L1', cNodeUuid: L1 },
			nodePathName: 'S0/VL0/B0/L1',
			expectedWarnings: [
				{
					type: 'incoherent-path-names',
					details: {
						elementTag: 'ConnectivityNode',
						attributes: [{ name: 'pathName', value: 'S0/VL0/B0/L1', expected: 'S1/VL1/B1/L1' }],
					},
				},
			],
		},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, async () => {
			const hooks = createSclIoHooks()
			const substation = makeRecord('Substation', { name: 'S1' })
			const voltageLevel = makeRecord('VoltageLevel', { name: 'VL1' })
			const bay = makeRecord('Bay', { name: 'B1' })
			const equipment = makeRecord('ConductingEquipment', { name: 'QA1', type: 'CBR' })
			const terminal = makeRecord('Terminal', testCase.terminal)
			const nodes = [
				makeRecord('ConnectivityNode', {
					name: 'L1',
					pathName: testCase.nodePathName ?? 'S1/VL1/B1/L1',
					uuid: L1,
				}),
				makeRecord('ConnectivityNode', { name: 'L2', pathName: 'S1/VL1/B1/L2', uuid: L2 }),
			]

			hooks.beforeImportRecord!({
				record: terminal,
				ancestry: [substation, voltageLevel, bay, equipment],
			})
			for (const node of nodes) {
				hooks.beforeImportRecord!({ record: node, ancestry: [substation, voltageLevel, bay] })
			}

			const result = await hooks.afterImport!()
			expect(
				result.warnings?.map((warning) => ({ type: warning.type, details: warning.details })) ?? [],
			).toEqual(testCase.expectedWarnings)
		})
	})
})

/**
 * A path naming an LNode is resolved to its uuid; the data it carries (`PhV.phsA.cVal.mag.f`) is
 * split into the data object and the data attribute the companions hold, against the data model the
 * file holds for the logical node type of the LNode the path names.
 */
describe('import of the data names beside an LNode uuid written from a path', () => {
	const substation = makeRecord('Substation', { name: 'S1' })
	const fn = makeRecord('Function', { name: 'F1', uuid: 'function-uuid' })
	const templates = makeRecord('DataTypeTemplates')

	/**
	 * The data model of the logical node type `PTRC_T` with the elements above each, in the order an
	 * import pass hands records over: a record once it is complete, so its children first.
	 */
	function dataTypeRecords(): { record: AnyRawRecord; ancestry: AnyRawRecord[] }[] {
		const lnodeType = makeRecord('LNodeType', { id: 'PTRC_T' })
		const wyeType = makeRecord('DOType', { id: 'WYE_T' })
		const cmvType = makeRecord('DOType', { id: 'CMV_T' })
		const cvalType = makeRecord('DAType', { id: 'CVAL_T' })
		const avType = makeRecord('DAType', { id: 'AV_T' })
		return [
			{ record: lnodeType, ancestry: [templates] },
			{
				record: makeRecord('DO', { name: 'PhV', type: 'WYE_T' }),
				ancestry: [templates, lnodeType],
			},
			{ record: wyeType, ancestry: [templates] },
			{
				record: makeRecord('SDO', { name: 'phsA', type: 'CMV_T' }),
				ancestry: [templates, wyeType],
			},
			{ record: cmvType, ancestry: [templates] },
			{
				record: makeRecord('DA', { name: 'cVal', bType: 'Struct', type: 'CVAL_T' }),
				ancestry: [templates, cmvType],
			},
			{ record: cvalType, ancestry: [templates] },
			{
				record: makeRecord('BDA', { name: 'mag', bType: 'Struct', type: 'AV_T' }),
				ancestry: [templates, cvalType],
			},
			{ record: avType, ancestry: [templates] },
			{ record: makeRecord('BDA', { name: 'f', bType: 'FLOAT32' }), ancestry: [templates, avType] },
		].reverse()
	}

	type SignalTag = 'SourceRef' | 'ControlRef' | 'ProcessEcho' | 'LNodeDataRef' | 'InputVar'

	/** The elements above a reference of `tagName` naming an LNode's data, as its own tag keeps them. */
	function ancestryOf(params: {
		tagName: SignalTag
		sender: AnyRawRecord
		holder: AnyRawRecord
	}): AnyRawRecord[] {
		const { tagName, sender, holder } = params
		switch (tagName) {
			case 'SourceRef':
				return [substation, fn, holder, makeRecord('LNodeInputs')]
			case 'ControlRef':
				return [substation, fn, holder, makeRecord('LNodeOutputs')]
			case 'ProcessEcho':
				return [substation, fn]
			case 'LNodeDataRef':
				return [
					substation,
					makeRecord('Application'),
					makeRecord('FunctionRef', { function: 'S1/F1' }),
					makeRecord('SignalRole'),
				]
			case 'InputVar':
				return [substation, fn, sender, makeRecord('BehaviorDescription')]
		}
	}

	/** The updates and warnings of a file whose LNode `PTRC1` (of type `lnType`) is named by a reference of the LNode `XCBR1`. */
	async function importSignal(params: {
		signal: { tagName: SignalTag; attributes: Record<string, string> }
		lnType?: string
		withDataTypes?: boolean
	}) {
		const { signal, lnType = 'PTRC_T', withDataTypes = true } = params
		const hooks = createSclIoHooks()
		const sender = makeRecord('LNode', {
			iedName: 'None',
			lnClass: 'PTRC',
			lnInst: '1',
			lnType,
			uuid: 'sender-uuid',
		})
		const holder = makeRecord('LNode', { iedName: 'None', lnClass: 'XCBR', lnInst: '1' })
		const signalRecord = makeRecord(signal.tagName, signal.attributes)

		hooks.beforeImportRecord!({ record: fn, ancestry: [substation] })
		hooks.beforeImportRecord!({ record: sender, ancestry: [substation, fn] })
		hooks.beforeImportRecord!({ record: holder, ancestry: [substation, fn] })
		hooks.beforeImportRecord!({
			record: signalRecord,
			ancestry: ancestryOf({ tagName: signal.tagName, sender, holder }),
		})
		if (withDataTypes) {
			for (const fed of dataTypeRecords()) hooks.beforeImportRecord!(fed)
		}
		const result = await hooks.afterImport!()
		return {
			warnings: result.warnings ?? [],
			signalUpdates: result.updates?.filter((update) => update.recordId === signalRecord.id),
			signalId: signalRecord.id,
		}
	}

	type TestCase = {
		signal: { tagName: SignalTag; attributes: Record<string, string> }
		lnType?: string
		withDataTypes?: boolean
		/** What the reference is updated with; nothing when the path cannot be split and no companion is there. */
		expectedAttributes?: { name: string; value: string }[]
		/** The path attribute the import reports `data-path-not-split` for, and its value. */
		notSplit?: { pathAttribute: string; pathValue: string }
	}

	const testCases: Record<string, TestCase> = {
		'SourceRef naming its source by a path through a sub data object, no companions → uuid, data object and data attribute written':
			{
				signal: {
					tagName: 'SourceRef',
					attributes: { input: 'Trip', source: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f' },
				},
				expectedAttributes: [
					{ name: 'sourceLNodeUuid', value: 'sender-uuid' },
					{ name: 'sourceDoName', value: 'PhV.phsA' },
					{ name: 'sourceDaName', value: 'cVal.mag.f' },
				],
			},
		'SourceRef naming a data object only by its path → uuid and data object written, no data attribute':
			{
				signal: {
					tagName: 'SourceRef',
					attributes: { input: 'Trip', source: 'S1/F1/PTRC1.PhV.phsA' },
				},
				expectedAttributes: [
					{ name: 'sourceLNodeUuid', value: 'sender-uuid' },
					{ name: 'sourceDoName', value: 'PhV.phsA' },
				],
			},
		'SourceRef naming a logical node only by its path → no uuid, one data-path-not-split warning': {
			signal: { tagName: 'SourceRef', attributes: { input: 'Trip', source: 'S1/F1/PTRC1' } },
			notSplit: { pathAttribute: 'source', pathValue: 'S1/F1/PTRC1' },
		},
		'SourceRef naming a logical node only by its path, the data object written beside → uuid written, companion kept':
			{
				signal: {
					tagName: 'SourceRef',
					attributes: { input: 'Trip', source: 'S1/F1/PTRC1', sourceDoName: 'Op' },
				},
				expectedAttributes: [{ name: 'sourceLNodeUuid', value: 'sender-uuid' }],
			},
		'SourceRef already carrying its data names → they stay, whatever the path says': {
			signal: {
				tagName: 'SourceRef',
				attributes: {
					input: 'Trip',
					source: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f',
					sourceDoName: 'PhV',
					sourceDaName: 'phsA',
				},
			},
			expectedAttributes: [{ name: 'sourceLNodeUuid', value: 'sender-uuid' }],
		},
		'SourceRef with an empty data object name → counts as absent, written from the path': {
			signal: {
				tagName: 'SourceRef',
				attributes: {
					input: 'Trip',
					source: 'S1/F1/PTRC1.PhV.phsA.cVal',
					sourceDoName: '',
				},
			},
			expectedAttributes: [
				{ name: 'sourceLNodeUuid', value: 'sender-uuid' },
				{ name: 'sourceDoName', value: 'PhV.phsA' },
				{ name: 'sourceDaName', value: 'cVal' },
			],
		},
		'SourceRef with a data attribute name the path agrees with and no data object name → data object written':
			{
				signal: {
					tagName: 'SourceRef',
					attributes: {
						input: 'Trip',
						source: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f',
						sourceDaName: 'cVal.mag.f',
					},
				},
				expectedAttributes: [
					{ name: 'sourceLNodeUuid', value: 'sender-uuid' },
					{ name: 'sourceDoName', value: 'PhV.phsA' },
				],
			},
		'SourceRef with a data attribute name the path disagrees with and no data object name → no uuid, one data-path-not-split warning':
			{
				signal: {
					tagName: 'SourceRef',
					attributes: {
						input: 'Trip',
						source: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f',
						sourceDaName: 'cVal',
					},
				},
				notSplit: { pathAttribute: 'source', pathValue: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f' },
			},
		'SourceRef whose logical node type the file lacks → no uuid, one data-path-not-split warning': {
			signal: {
				tagName: 'SourceRef',
				attributes: { input: 'Trip', source: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f' },
			},
			lnType: 'XCBR_T',
			notSplit: { pathAttribute: 'source', pathValue: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f' },
		},
		'SourceRef in a file with no data types → no uuid, one data-path-not-split warning': {
			signal: {
				tagName: 'SourceRef',
				attributes: { input: 'Trip', source: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f' },
			},
			withDataTypes: false,
			notSplit: { pathAttribute: 'source', pathValue: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f' },
		},
		'SourceRef whose path leaves the data model → no uuid, one data-path-not-split warning': {
			signal: {
				tagName: 'SourceRef',
				attributes: { input: 'Trip', source: 'S1/F1/PTRC1.PhV.phsB.cVal' },
			},
			notSplit: { pathAttribute: 'source', pathValue: 'S1/F1/PTRC1.PhV.phsB.cVal' },
		},
		'ControlRef naming a data object through a sub data object by its path → uuid and data object written':
			{
				signal: {
					tagName: 'ControlRef',
					attributes: { output: 'Close', controlled: 'S1/F1/PTRC1.PhV.phsA' },
				},
				expectedAttributes: [
					{ name: 'controlledLNodeUuid', value: 'sender-uuid' },
					{ name: 'controlledDoName', value: 'PhV.phsA' },
				],
			},
		'ControlRef whose path reaches a data attribute → no uuid, one data-path-not-split warning': {
			signal: {
				tagName: 'ControlRef',
				attributes: { output: 'Close', controlled: 'S1/F1/PTRC1.PhV.phsA.cVal' },
			},
			notSplit: { pathAttribute: 'controlled', pathValue: 'S1/F1/PTRC1.PhV.phsA.cVal' },
		},
		'ProcessEcho naming its source by a path → uuid, data object and data attribute written': {
			signal: {
				tagName: 'ProcessEcho',
				attributes: { source: 'S1/F1/PTRC1.PhV.phsA.cVal.mag.f' },
			},
			expectedAttributes: [
				{ name: 'sourceLNodeUuid', value: 'sender-uuid' },
				{ name: 'sourceDoName', value: 'PhV.phsA' },
				{ name: 'sourceDaName', value: 'cVal.mag.f' },
			],
		},
		'LNodeDataRef naming data by a path → uuid, data object and data attribute written': {
			signal: {
				tagName: 'LNodeDataRef',
				attributes: { data: 'PTRC1.PhV.phsA.cVal.mag.f' },
			},
			expectedAttributes: [
				{ name: 'lnodeUuid', value: 'sender-uuid' },
				{ name: 'doName', value: 'PhV.phsA' },
				{ name: 'daName', value: 'cVal.mag.f' },
			],
		},
		'InputVar naming data by a local path → uuid, data object and data attribute written': {
			signal: {
				tagName: 'InputVar',
				attributes: { dataName: 'PhV.phsA.cVal.mag.f' },
			},
			expectedAttributes: [
				{ name: 'lnodeUuid', value: 'sender-uuid' },
				{ name: 'doName', value: 'PhV.phsA' },
				{ name: 'daName', value: 'cVal.mag.f' },
			],
		},
	}

	for (const [description, testCase] of Object.entries(testCases)) {
		it(description, async () => {
			const { warnings, signalUpdates, signalId } = await importSignal(testCase)
			expect(signalUpdates).toEqual(
				testCase.expectedAttributes
					? [{ recordId: signalId, attributes: testCase.expectedAttributes }]
					: [],
			)
			expect(warnings).toEqual(
				testCase.notSplit
					? [
							{
								type: 'data-path-not-split',
								recordId: signalId,
								details: { elementTag: testCase.signal.tagName, ...testCase.notSplit },
							},
						]
					: [],
			)
		})
	}
})

// ── Helpers ──────────────────────────────────────────────────────────

/** The `LNodeSpecNaming` an LNode of the file carries. */
function specNamingOf(lnode: AnyRawRecord): AnyRawRecord {
	return { ...makeRecord('LNodeSpecNaming'), parent: { id: lnode.id, tagName: lnode.tagName } }
}

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

describe('import of a reference holding its uuid only', () => {
	/** An LNode of a function mapped to the logical node `XCBR1` of `LD0` in `IED1`. */
	const MAPPED_LNODE = 'iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="uuid-xcbr"'
	/** An LNode of a function assigned to no IED. */
	const UNMAPPED_LNODE = 'iedName="None" lnClass="XSWI" lnInst="1"'

	/**
	 * A function whose LNode (`lnode`) holds a SourceRef naming by uuid an ExtRef of `extRef`'s
	 * attributes (and by `address` when given, else by its uuid only), held by the logical node
	 * `XCBR1` of the IED `IED1`.
	 */
	function withExtRefInIed(params: { lnode: string; extRef: string; address?: string }): string {
		const addressAttribute = params.address ? 'extRefAddr="' + params.address + '"' : ''
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<Function name="F1" ${id}="f1">
						<LNode ${params.lnode} ${id}="lnode">
							<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${id}="spec"/>
							<eIEC61850-6-100:LNodeInputs ${id}="inputs">
								<eIEC61850-6-100:SourceRef input="Trip" extRefUuid="uuid-extref" ${addressAttribute} ${id}="ref"/>
							</eIEC61850-6-100:LNodeInputs>
						</LNode>
					</Function>
				</Substation>
				<IED name="IED1" ${id}="ied1">
					<AccessPoint name="AP1" ${id}="ap1">
						<Server ${id}="srv1">
							<Authentication ${id}="auth1"/>
							<LDevice inst="LD0" ${id}="ld1">
								<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
								<LN lnClass="XCBR" inst="1" lnType="T1" uuid="uuid-xcbr" ${id}="ln-xcbr">
									<Inputs ${id}="inputs-xcbr">
										<ExtRef ${params.extRef} uuid="uuid-extref" ${id}="extref"/>
									</Inputs>
								</LN>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>
		`
	}

	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'FunctionCatRef with functionUuid, no function path → path written on import': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" uuid="uuid-target" ${id}="target"/>
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
							<!-- no function path: a tool that writes the uuid only -->
							<eIEC61850-6-100:FunctionCatRef functionUuid="uuid-target" ${id}="ref"/>
						</eIEC61850-6-100:FunctionCategory>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//v2019C1:FunctionCatRef[@functionUuid="uuid-target" and @function="S1/F1"]',
			],
		},
		'SourceRef with sourceLNodeUuid + DO/DA, no source path → path with the data written on import':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:LNodeSpecNaming sLnClass="XCBR" sLnInst="1" ${id}="spec"/>
								</LNode>
								<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef input="Pos" sourceLNodeUuid="uuid-target" sourceDoName="Pos" sourceDaName="stVal" ${id}="ref"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:SourceRef[@sourceLNodeUuid="uuid-target" and @source="S1/F1/XCBR1.Pos.stVal"]',
				],
			},
		'InputVar with lnodeUuid of its LNode + DO/DA, no dataName → local data path written on import':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="XCBR" lnInst="1" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="bd1">
										<eIEC61850-6-100:InputVar varName="pos" lnodeUuid="uuid-target" doName="Pos" daName="stVal" ${id}="ref"/>
									</eIEC61850-6-100:BehaviorDescription>
								</LNode>
							</Function>
						</Substation>
					</SCL>
				`,
				expectedQueries: ['//v2019C1:InputVar[@lnodeUuid="uuid-target" and @dataName="Pos.stVal"]'],
			},
		'InputVar in a BehaviorDescription of the Function, inputUuid only → inputName "<LNode>.<input>" written on import':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-target" ${id}="target"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
								<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="bd1">
									<eIEC61850-6-100:InputVar varName="trip" inputUuid="uuid-target" ${id}="ref"/>
								</eIEC61850-6-100:BehaviorDescription>
							</Function>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:InputVar[@inputUuid="uuid-target" and @inputName="PTRC1.Trip"]',
				],
			},
		'SourceRef with extRefUuid only, LNode mapped to the logical node holding the ExtRef → intAddr alone written on import':
			{
				sourceXml: withExtRefInIed({ lnode: MAPPED_LNODE, extRef: 'intAddr="Trip"' }),
				expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-extref" and @extRefAddr="Trip"]'],
			},
		'SourceRef with extRefUuid only, LNode not mapped → full path written on import': {
			sourceXml: withExtRefInIed({ lnode: UNMAPPED_LNODE, extRef: 'intAddr="Trip"' }),
			expectedQueries: [
				'//v2019C1:SourceRef[@extRefUuid="uuid-extref" and @extRefAddr="IED1/LD0/XCBR1.Trip"]',
			],
		},
		'SourceRef with extRefUuid only, ExtRef without intAddr → no extRefAddr written on import': {
			sourceXml: withExtRefInIed({ lnode: MAPPED_LNODE, extRef: '' }),
			expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-extref"]'],
			unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr]'],
		},
		'SourceRef with extRefAddr naming another ExtRef than its extRefUuid, LNode mapped → the uuid wins, intAddr alone written':
			{
				allowIncoherentReferences: 'a file whose address and uuid disagree is what is under test',
				sourceXml: withExtRefInIed({
					lnode: MAPPED_LNODE,
					extRef: 'intAddr="Trip"',
					address: 'IED1/LD0/XCBR1.Other',
				}),
				expectedQueries: ['//v2019C1:SourceRef[@extRefUuid="uuid-extref" and @extRefAddr="Trip"]'],
			},
		'SourceRef with the full extRefAddr naming its ExtRef, LNode mapped → kept as written': {
			sourceXml: withExtRefInIed({
				lnode: MAPPED_LNODE,
				extRef: 'intAddr="Trip"',
				address: 'IED1/LD0/XCBR1.Trip',
			}),
			expectedQueries: [
				'//v2019C1:SourceRef[@extRefUuid="uuid-extref" and @extRefAddr="IED1/LD0/XCBR1.Trip"]',
			],
		},
		'SourceRef naming its source by a path through a sub data object → source uuid and data names written on import':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="PTRC" lnInst="1" lnType="PTRC_T" iedName="None" uuid="uuid-target" ${id}="target">
									<eIEC61850-6-100:LNodeSpecNaming sLnClass="PTRC" sLnInst="1" ${id}="spec-target"/>
								</LNode>
								<LNode lnClass="XCBR" lnInst="1" iedName="None" ${id}="owner">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef input="Pos" source="S1/F1/PTRC1.PhV.phsA.cVal" ${id}="ref"/>
									</eIEC61850-6-100:LNodeInputs>
								</LNode>
							</Function>
						</Substation>
						<DataTypeTemplates ${id}="data-type-templates">
							<LNodeType id="PTRC_T" lnClass="PTRC" ${id}="lnode-type">
								<DO name="PhV" type="WYE_T" ${id}="do-phv"/>
							</LNodeType>
							<DOType id="WYE_T" cdc="WYE" ${id}="do-type-wye">
								<SDO name="phsA" type="CMV_T" ${id}="sdo-phsa"/>
							</DOType>
							<DOType id="CMV_T" cdc="CMV" ${id}="do-type-cmv">
								<DA name="cVal" fc="MX" bType="Struct" type="CVAL_T" ${id}="da-cval"/>
							</DOType>
							<DAType id="CVAL_T" ${id}="da-type-cval">
								<BDA name="mag" bType="FLOAT32" ${id}="bda-mag"/>
							</DAType>
						</DataTypeTemplates>
					</SCL>
				`,
				expectedQueries: [
					'//v2019C1:SourceRef[@source="S1/F1/PTRC1.PhV.phsA.cVal" and @sourceLNodeUuid="uuid-target" and @sourceDoName="PhV.phsA" and @sourceDaName="cVal"]',
				],
			},
		'reference whose uuid names no element of the file → left without path': {
			allowIncoherentReferences: 'a uuid naming an element of another file is what is under test',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
							<eIEC61850-6-100:FunctionCatRef functionUuid="uuid-elsewhere" ${id}="ref"/>
						</eIEC61850-6-100:FunctionCategory>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="uuid-elsewhere"]'],
			unexpectedQueries: ['//v2019C1:FunctionCatRef[@function]'],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})

describe('import of a name an earlier version wrote', () => {
	function withInputs(sourceRefs: string, inputName: string): string {
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<Function name="F1" ${id}="f1">
						<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
							<eIEC61850-6-100:LNodeInputs ${id}="inputs">${sourceRefs}</eIEC61850-6-100:LNodeInputs>
							<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="bd1">
								<eIEC61850-6-100:InputVar varName="v" inputName="${inputName}" ${id}="ref"/>
							</eIEC61850-6-100:BehaviorDescription>
						</LNode>
					</Function>
				</Substation>
			</SCL>
		`
	}

	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'"Trip.general" for the only Trip input → resolved, written "Trip"': {
			sourceXml: withInputs(
				`<eIEC61850-6-100:SourceRef input="Trip" pDA="general" uuid="uuid-general" ${id}="sr-general"/>`,
				'Trip.general',
			),
			expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-general" and @inputName="Trip"]'],
		},
		'"Trip" for instance 1 of two → resolved, written "Trip(1)"': {
			sourceXml: withInputs(
				`<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-first" ${id}="sr-first"/>
				<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" uuid="uuid-second" ${id}="sr-second"/>`,
				'Trip',
			),
			expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-first" and @inputName="Trip(1)"]'],
		},
		'the standard "Trip(2)" → resolved, left as written': {
			sourceXml: withInputs(
				`<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-first" ${id}="sr-first"/>
				<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" uuid="uuid-second" ${id}="sr-second"/>`,
				'Trip(2)',
			),
			expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-second" and @inputName="Trip(2)"]'],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})

describe('import of a resourceName', () => {
	function withResources(resourceName: string): string {
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<Function name="F1" ${id}="f1">
						<eIEC61850-6-100:ProcessResources ${id}="prs-f1">
							<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-function-pr" ${id}="pr-f1"/>
						</eIEC61850-6-100:ProcessResources>
						<SubFunction name="SF1" ${id}="sf1">
							<eIEC61850-6-100:ProcessResources ${id}="prs-sf1">
								<eIEC61850-6-100:ProcessResource name="PR1" uuid="uuid-nearest-pr" ${id}="pr-sf1"/>
								<eIEC61850-6-100:ProcessResource name="PR2" uuid="uuid-other-pr" ${id}="pr2-sf1"/>
							</eIEC61850-6-100:ProcessResources>
							<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
								<eIEC61850-6-100:LNodeInputs ${id}="inputs">
									<eIEC61850-6-100:SourceRef input="Trip" resourceName="${resourceName}" ${id}="ref"/>
								</eIEC61850-6-100:LNodeInputs>
							</LNode>
						</SubFunction>
					</Function>
				</Substation>
			</SCL>
		`
	}

	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'a name a homonym higher up also has → the nearest ProcessResource': {
			sourceXml: withResources('PR1'),
			expectedQueries: [
				'//v2019C1:SourceRef[@resourceUuid="uuid-nearest-pr" and @resourceName="PR1"]',
			],
		},
		'the full path an earlier version wrote → resolved, written as the bare name': {
			sourceXml: withResources('S1/F1/PR1'),
			expectedQueries: [
				'//v2019C1:SourceRef[@resourceUuid="uuid-function-pr" and @resourceName="PR1"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})

describe('import of an LNode without its LNodeSpecNaming', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'an LNode allocated to no IED -> it gains its specified naming, its own': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="None" ldInst="Prot" prefix="Main" lnClass="PTOC" lnInst="2" />
						</Function>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode[@lnClass="PTOC"]/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLdInst="Prot"][@sPrefix="Main"][@sLnClass="PTOC"][@sLnInst="2"]',
			],
			unexpectedQueries: ['//v2019C1:LNodeSpecNaming[@sIedName]'],
		},
		'an LNode bound to an IED -> it gains the naming of the logical node it is bound to, without the IED and LD names':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation ${id}="substation" name="S1">
							<Function ${id}="function" name="F1">
								<LNode ${id}="lnode" iedName="P1" ldInst="LD0" prefix="Main" lnClass="PTOC" lnInst="2" />
							</Function>
						</Substation>
					</SCL>
				`,
				expectedQueries: [
					'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sPrefix="Main"][@sLnClass="PTOC"][@sLnInst="2"]',
				],
				unexpectedQueries: [
					'//v2019C1:LNodeSpecNaming[@sIedName]',
					'//v2019C1:LNodeSpecNaming[@sLdInst]',
				],
			},
		'an LNode with inputs in its Private -> the naming joins them in that Private': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="PTOC" lnInst="1">
								<Private ${id}="lnode-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef ${id}="source-ref" input="Trip" />
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeSpecNaming[@sLnClass="PTOC"][@sLnInst="1"]',
				'//default:LNode/default:Private[@type="eIEC61850-6-100"]/v2019C1:LNodeInputs/v2019C1:SourceRef',
			],
			unexpectedQueries: ['//default:LNode/default:Private[2]'],
		},
		'an LNode with its LNodeSpecNaming -> kept as it is': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="P1" ldInst="LD0" lnClass="PTOC" lnInst="2">
								<Private ${id}="lnode-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeSpecNaming ${id}="spec-naming" sLnClass="PTOC" sLnInst="7" />
								</Private>
							</LNode>
						</Function>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:LNodeSpecNaming[@sLnInst="7"]'],
			unexpectedQueries: [
				'//v2019C1:LNodeSpecNaming[2]',
				'//v2019C1:LNodeSpecNaming[@sLnInst="2"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})

describe('import warning for a derived specified naming', () => {
	it('an LNode bound to an IED without LNodeSpecNaming -> one derived-specification-naming warning carrying the naming it was given', async () => {
		const hooks = createSclIoHooks()
		const lnode = makeRecord('LNode', {
			iedName: 'P1',
			ldInst: 'LD0',
			lnClass: 'PTOC',
			lnInst: '2',
		})
		hooks.beforeImportRecord!({ record: lnode, ancestry: [] })
		hooks.beforeImportRecord!({
			record: makeRecord('LNode', { iedName: 'None', lnClass: 'XCBR', lnInst: '1' }),
			ancestry: [],
		})

		const result = await hooks.afterImport!()
		const expected: Array<
			Pick<DerivedSpecificationNamingWarning, 'type' | 'recordId' | 'details'>
		> = [
			{
				type: 'derived-specification-naming',
				recordId: lnode.id,
				details: {
					iedName: 'P1',
					specifiedNaming: [
						{ name: 'sLnClass', value: 'PTOC' },
						{ name: 'sLnInst', value: '2' },
					],
				},
			},
		]
		expect(
			result.warnings?.map((warning) => ({
				type: warning.type,
				recordId: warning.recordId,
				details: warning.details,
			})),
		).toEqual(expected)
	})
})

describe('import of paths through an LNode bound to an IED', () => {
	/** A breaker specified as XCBR1, bound to the IED's Q0XCBR2; `controlRef` is the controller's ControlRef. */
	function boundBreakerXml(controlRef: string): string {
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation ${id}="substation" name="S1">
					<Function ${id}="function" name="F1">
						<LNode ${id}="breaker" uuid="breaker-uuid" iedName="P1" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2">
							<Private ${id}="breaker-private" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming ${id}="breaker-naming" sLnClass="XCBR" sLnInst="1" />
							</Private>
						</LNode>
						<LNode ${id}="controller" iedName="None" lnClass="CSWI" lnInst="1">
							<Private ${id}="controller-private" type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeSpecNaming ${id}="controller-naming" sLnClass="CSWI" sLnInst="1" />
								<eIEC61850-6-100:LNodeOutputs ${id}="outputs">${controlRef}</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>
		`
	}

	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'a path naming the LNode as specified -> resolved, kept': {
			sourceXml: boundBreakerXml(
				`<eIEC61850-6-100:ControlRef ${id}="control-ref" output="Oper" controlled="S1/F1/XCBR1.Pos" controlledDoName="Pos" />`,
			),
			expectedQueries: [
				'//v2019C1:ControlRef[@controlled="S1/F1/XCBR1.Pos"][@controlledLNodeUuid="breaker-uuid"]',
			],
		},
		'a path an earlier version wrote with the IED naming -> resolved, written as specified': {
			sourceXml: boundBreakerXml(
				`<eIEC61850-6-100:ControlRef ${id}="control-ref" output="Oper" controlled="S1/F1/Q0XCBR2.Pos" controlledDoName="Pos" />`,
			),
			expectedQueries: [
				'//v2019C1:ControlRef[@controlled="S1/F1/XCBR1.Pos"][@controlledLNodeUuid="breaker-uuid"]',
			],
		},
		'a uuid alone -> the path names the LNode as specified': {
			sourceXml: boundBreakerXml(
				`<eIEC61850-6-100:ControlRef ${id}="control-ref" output="Oper" controlledLNodeUuid="breaker-uuid" controlledDoName="Pos" />`,
			),
			expectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/XCBR1.Pos"]'],
		},
		'a uuid with the path an earlier version wrote -> the path written as specified': {
			sourceXml: boundBreakerXml(
				`<eIEC61850-6-100:ControlRef ${id}="control-ref" output="Oper" controlled="S1/F1/Q0XCBR2.Pos" controlledLNodeUuid="breaker-uuid" controlledDoName="Pos" />`,
			),
			expectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/XCBR1.Pos"]'],
			unexpectedQueries: ['//v2019C1:ControlRef[@controlled="S1/F1/Q0XCBR2.Pos"]'],
		},
		'a uuid with a signal name an earlier version wrote -> the name written in the standard form': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="trip" iedName="None" lnClass="PTRC" lnInst="1">
								<Private ${id}="trip-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:LNodeInputs ${id}="inputs">
										<eIEC61850-6-100:SourceRef ${id}="source-ref" uuid="source-ref-uuid" input="Trip" pDA="general" />
									</eIEC61850-6-100:LNodeInputs>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<Substation ${id}="application-substation" name="S2">
						<Private ${id}="application-private" type="eIEC61850-6-100">
							<eIEC61850-6-100:Application ${id}="application" name="A1">
								<eIEC61850-6-100:FunctionRole ${id}="role" name="R1">
									<eIEC61850-6-100:FunctionRoleContent ${id}="content">
										<eIEC61850-6-100:FunctionRef ${id}="function-ref" function="S1/F1">
											<eIEC61850-6-100:SignalRole ${id}="signal-role" name="Input">
												<eIEC61850-6-100:LNodeInputRef ${id}="input-ref" sourceRef="S1/F1/PTRC1.Trip.general" sourceRefUuid="source-ref-uuid" />
											</eIEC61850-6-100:SignalRole>
										</eIEC61850-6-100:FunctionRef>
									</eIEC61850-6-100:FunctionRoleContent>
								</eIEC61850-6-100:FunctionRole>
							</eIEC61850-6-100:Application>
						</Private>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:LNodeInputRef[@sourceRef="PTRC1/Trip"]'],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})

describe('import of an IED reference named by a tuple', () => {
	/** P1 subscribes to P2: P2 publishes gcb1 from its LLN0 and holds Q0XCBR2; both on subnetwork W1. */
	function twoDevicesXml(
		params: {
			subscriber?: string
			communication?: string
			subscribers?: string
			reportControls?: string
		} = {},
	): string {
		const { subscriber = '', communication = '', subscribers = '', reportControls = '' } = params
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Header id="project"/>
				<Communication ${id}="communication">
					<SubNetwork ${id}="subnetwork" name="W1">
						${communication}
					</SubNetwork>
				</Communication>
				<IED ${id}="p1" name="P1">
					<AccessPoint ${id}="p1-hmi-ap" name="AP2" uuid="p1-hmi-ap-uuid">
						<LN ${id}="p1-hmi" lnClass="IHMI" inst="1" lnType="IHMI_T" uuid="p1-hmi-uuid"/>
					</AccessPoint>
					<AccessPoint ${id}="p1-ap" name="AP1" uuid="p1-ap-uuid">
						<Server ${id}="p1-server">
							<LDevice ${id}="p1-ld" inst="LD0" uuid="p1-ld-uuid">
								<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p1-lln0-uuid">
									${subscriber}
								</LN0>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<IED ${id}="p2" name="P2">
					<AccessPoint ${id}="p2-ap" name="AP1" uuid="p2-ap-uuid">
						<Server ${id}="p2-server">
							<LDevice ${id}="p2-ld" inst="LD0" uuid="p2-ld-uuid">
								<LN0 ${id}="p2-lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="p2-lln0-uuid">
									<DataSet ${id}="p2-dataset" name="ds1">
										<FCDA ${id}="p2-fcda" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" fc="ST"/>
									</DataSet>
									<GSEControl ${id}="p2-gcb" name="gcb1" appID="gcb1" datSet="ds1" uuid="p2-gcb-uuid">
										${subscribers}
									</GSEControl>
									${reportControls}
								</LN0>
								<LN ${id}="p2-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="p2-breaker-uuid"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>
		`
	}

	const testCases: SclTest.TestCases = {
		'ConnectedAP naming an access point of the file -> its apUuid filled': {
			sourceXml: twoDevicesXml({
				communication: `<ConnectedAP ${id}="p2-connected-ap" iedName="P2" apName="AP1"/>`,
			}),
			expectedQueries: [
				'//default:ConnectedAP[@iedName="P2"][@apName="AP1"][@apUuid="p2-ap-uuid"]',
			],
		},

		'ExtRef bound by its names to an LN and a control block of the file -> lnUuid and srcCBUuid filled':
			{
				sourceXml: twoDevicesXml({
					subscriber: /* xml */ `
						<Inputs ${id}="p1-inputs">
							<ExtRef ${id}="p1-ext-ref" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" daName="stVal" srcLDInst="LD0" srcCBName="gcb1" intAddr="Pos.stVal"/>
						</Inputs>
					`,
				}),
				expectedQueries: [
					'//default:ExtRef[@iedName="P2"][@lnUuid="p2-breaker-uuid"][@srcCBUuid="p2-gcb-uuid"]',
				],
			},

		'GSE of a ConnectedAP naming a control block of its device -> its cbUuid filled': {
			sourceXml: twoDevicesXml({
				communication: /* xml */ `
					<ConnectedAP ${id}="p2-connected-ap" iedName="P2" apName="AP1">
						<GSE ${id}="p2-gse" ldInst="LD0" cbName="gcb1"/>
					</ConnectedAP>
				`,
			}),
			expectedQueries: ['//default:GSE[@ldInst="LD0"][@cbName="gcb1"][@cbUuid="p2-gcb-uuid"]'],
		},

		'FCDA naming an LN of its own device -> its lnUuid filled': {
			sourceXml: twoDevicesXml(),
			expectedQueries: ['//default:FCDA[@lnClass="XCBR"][@lnUuid="p2-breaker-uuid"]'],
		},

		'IEDName naming a subscriber by its access point -> apUuid filled, nothing else': {
			sourceXml: twoDevicesXml({
				subscribers: `<IEDName ${id}="subscriber" apRef="AP1">P1</IEDName>`,
			}),
			expectedQueries: ['//default:IEDName[@apRef="AP1"][@apUuid="p1-ap-uuid"][not(@ldUuid)]'],
		},

		'IEDName naming a subscriber logical device -> ldUuid filled, not apUuid': {
			sourceXml: twoDevicesXml({
				subscribers: `<IEDName ${id}="subscriber" apRef="AP1" ldInst="LD0">P1</IEDName>`,
			}),
			expectedQueries: ['//default:IEDName[@ldInst="LD0"][@ldUuid="p1-ld-uuid"][not(@apUuid)]'],
		},

		'ExtRef bound to a device the file does not hold -> left as written': {
			sourceXml: twoDevicesXml({
				subscriber: /* xml */ `
					<Inputs ${id}="p1-inputs">
						<ExtRef ${id}="p1-ext-ref" iedName="P9" ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Tr" intAddr="Tr.general"/>
					</Inputs>
				`,
			}),
			expectedQueries: ['//default:ExtRef[@iedName="P9"][not(@lnUuid)]'],
		},

		'ExtRef not bound yet (intAddr only) -> left as written': {
			sourceXml: twoDevicesXml({
				subscriber: /* xml */ `
					<Inputs ${id}="p1-inputs">
						<ExtRef ${id}="p1-ext-ref" intAddr="Trip.general"/>
					</Inputs>
				`,
			}),
			expectedQueries: ['//default:ExtRef[@intAddr="Trip.general"][not(@lnUuid)][not(@srcCBUuid)]'],
		},

		'ConnectedAP already holding a uuid -> left as written': {
			allowIncoherentReferences: 'the uuid names no element of the file: what the import keeps',
			sourceXml: twoDevicesXml({
				communication: `<ConnectedAP ${id}="p2-connected-ap" iedName="P2" apName="AP1" apUuid="kept-uuid"/>`,
			}),
			expectedQueries: ['//default:ConnectedAP[@apUuid="kept-uuid"]'],
			unexpectedQueries: ['//default:ConnectedAP[@apUuid="p2-ap-uuid"]'],
		},

		'ExtRef bound inside its own IED (iedName @) -> lnUuid filled': {
			sourceXml: twoDevicesXml({
				subscriber: /* xml */ `
					<Inputs ${id}="p1-inputs">
						<ExtRef ${id}="p1-ext-ref" iedName="@" ldInst="LD0" lnClass="LLN0" doName="Beh" intAddr="Beh.stVal"/>
					</Inputs>
				`,
			}),
			expectedQueries: ['//default:ExtRef[@iedName="@"][@lnUuid="p1-lln0-uuid"]'],
		},

		'GOOSE and report control blocks of the same name -> each reference gets the one of its kind': {
			sourceXml: twoDevicesXml({
				reportControls: `<ReportControl ${id}="p2-rcb" name="gcb1" confRev="1" uuid="p2-rcb-uuid"/>`,
				communication: /* xml */ `
					<ConnectedAP ${id}="p2-connected-ap" iedName="P2" apName="AP1">
						<GSE ${id}="p2-gse" ldInst="LD0" cbName="gcb1"/>
					</ConnectedAP>
				`,
				subscriber: /* xml */ `
					<Inputs ${id}="p1-inputs">
						<ExtRef ${id}="p1-goose" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" serviceType="GOOSE" srcCBName="gcb1" intAddr="Pos"/>
						<ExtRef ${id}="p1-report" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" serviceType="Report" srcCBName="gcb1" intAddr="PosRpt"/>
						<ExtRef ${id}="p1-unknown" iedName="P2" ldInst="LD0" prefix="Q0" lnClass="XCBR" lnInst="2" doName="Pos" srcCBName="gcb1" intAddr="PosAny"/>
					</Inputs>
				`,
			}),
			expectedQueries: [
				'//default:GSE[@cbName="gcb1"][@cbUuid="p2-gcb-uuid"]',
				'//default:ExtRef[@intAddr="Pos"][@srcCBUuid="p2-gcb-uuid"]',
				'//default:ExtRef[@intAddr="PosRpt"][@srcCBUuid="p2-rcb-uuid"]',
				// no service type: two control blocks answer, none is chosen
				'//default:ExtRef[@intAddr="PosAny"][not(@srcCBUuid)]',
			],
		},

		'ClientLN naming a logical node held by an access point -> left as written': {
			sourceXml: twoDevicesXml({
				reportControls: /* xml */ `
					<ReportControl ${id}="p2-rcb" name="rcb1" confRev="1" uuid="p2-rcb-uuid">
						<RptEnabled ${id}="p2-rpt-enabled">
							<ClientLN ${id}="p2-client" iedName="P1" apRef="AP2" ldInst="LD0" lnClass="IHMI" lnInst="1"/>
						</RptEnabled>
					</ReportControl>
				`,
			}),
			// P1 holds that IHMI1 directly in its access point AP2, outside any logical device
			expectedQueries: ['//default:ClientLN[@apRef="AP2"][@lnClass="IHMI"][not(@lnUuid)]'],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})

/**
 * A terminal names its connectivity node by path, by the names of the levels holding it and by
 * its uuid. On import the three are made to agree: the uuid wins over the path, the path over the
 * names. A connectivity node's `pathName` follows its position.
 */
describe('import of a reference whose path and uuid disagree', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'FunctionCatRef whose path names another Function → the uuid wins, path written from it': {
			allowIncoherentReferences: 'a file whose path and uuid disagree is what is under test',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" uuid="uuid-f1" ${id}="f1"/>
						<Function name="F2" uuid="uuid-f2" ${id}="f2"/>
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
							<eIEC61850-6-100:FunctionCatRef function="S1/F1" functionUuid="uuid-f2" ${id}="ref"/>
						</eIEC61850-6-100:FunctionCategory>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="uuid-f2" and @function="S1/F2"]'],
		},
		'FunctionCatRef whose path names nothing → the uuid wins, path written from it': {
			allowIncoherentReferences: 'a file whose path and uuid disagree is what is under test',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F2" uuid="uuid-f2" ${id}="f2"/>
						<eIEC61850-6-100:FunctionCategory name="Cat1" ${id}="cat1">
							<eIEC61850-6-100:FunctionCatRef function="S1/Gone" functionUuid="uuid-f2" ${id}="ref"/>
						</eIEC61850-6-100:FunctionCategory>
					</Substation>
				</SCL>
			`,
			expectedQueries: ['//v2019C1:FunctionCatRef[@functionUuid="uuid-f2" and @function="S1/F2"]'],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})

describe('import of a terminal', () => {
	const L1 = '00000000-0000-4000-8000-000000000001'
	const L2 = '00000000-0000-4000-8000-000000000002'

	function substationWith(params: { terminal: string; nodePathName?: string }): string {
		const { terminal, nodePathName = 'S1/VL1/B1/L1' } = params
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<VoltageLevel name="VL1" ${id}="vl1">
						<Bay name="B1" ${id}="b1">
							<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
								${terminal}
							</ConductingEquipment>
							<ConnectivityNode name="L1" pathName="${nodePathName}" uuid="${L1}" ${id}="l1"/>
							<ConnectivityNode name="L2" pathName="S1/VL1/B1/L2" uuid="${L2}" ${id}="l2"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`
	}

	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'path only → cNodeUuid resolved, the level names written from the node': {
			sourceXml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" ${id}="terminal"/>`,
			}),
			expectedQueries: [
				`//default:Terminal[@cNodeUuid="${L1}" and @connectivityNode="S1/VL1/B1/L1" and @substationName="S1" and @voltageLevelName="VL1" and @bayName="B1" and @cNodeName="L1"]`,
			],
		},
		'path only, names of another node → names rewritten from the node the path names': {
			allowIncoherentReferences: 'a file whose names disagree with its path is what is under test',
			sourceXml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" lineName="X" bayName="B9" cNodeName="L9" ${id}="terminal"/>`,
			}),
			expectedQueries: [
				`//default:Terminal[@cNodeUuid="${L1}" and @bayName="B1" and @cNodeName="L1" and not(@lineName)]`,
			],
		},
		'uuid only → path and names written from the node': {
			sourceXml: substationWith({
				terminal: `<Terminal cNodeUuid="${L2}" ${id}="terminal"/>`,
			}),
			expectedQueries: [
				`//default:Terminal[@cNodeUuid="${L2}" and @connectivityNode="S1/VL1/B1/L2" and @substationName="S1" and @voltageLevelName="VL1" and @bayName="B1" and @cNodeName="L2"]`,
			],
		},
		'path, names and uuid agreeing → kept as read': {
			sourceXml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="${L1}" ${id}="terminal"/>`,
			}),
			expectedQueries: [
				`//default:Terminal[@cNodeUuid="${L1}" and @connectivityNode="S1/VL1/B1/L1" and @cNodeName="L1"]`,
			],
		},
		'path naming one node, uuid another → the uuid wins, path and names rewritten': {
			allowIncoherentReferences: 'a file whose path and uuid disagree is what is under test',
			sourceXml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="${L2}" ${id}="terminal"/>`,
			}),
			expectedQueries: [
				`//default:Terminal[@cNodeUuid="${L2}" and @connectivityNode="S1/VL1/B1/L2" and @cNodeName="L2"]`,
			],
		},
		'path naming no node → left as read': {
			sourceXml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L9" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L9" ${id}="terminal"/>`,
			}),
			expectedQueries: [
				'//default:Terminal[@connectivityNode="S1/VL1/B1/L9" and @cNodeName="L9" and not(@cNodeUuid)]',
			],
		},
		'node whose pathName is not its position → pathName rewritten': {
			allowIncoherentReferences:
				'a file whose pathName disagrees with its position is what is under test',
			sourceXml: substationWith({
				terminal: `<Terminal connectivityNode="S1/VL1/B1/L1" cNodeName="L1" ${id}="terminal"/>`,
				nodePathName: 'S0/VL0/B0/L1',
			}),
			expectedQueries: ['//default:ConnectivityNode[@name="L1" and @pathName="S1/VL1/B1/L1"]'],
		},
		'node in a Line of a Process → resolved, process and line names written': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Process name="P1" ${id}="p1">
						<Line name="LN1" ${id}="line">
							<ConductingEquipment name="QA1" type="CBR" ${id}="qa1">
								<Terminal connectivityNode="P1/LN1/N1" cNodeName="N1" ${id}="terminal"/>
							</ConductingEquipment>
							<ConnectivityNode name="N1" pathName="P1/LN1/N1" uuid="${L1}" ${id}="n1"/>
						</Line>
					</Process>
				</SCL>
			`,
			expectedQueries: [
				`//default:Terminal[@cNodeUuid="${L1}" and @processName="P1" and @lineName="LN1" and @cNodeName="N1" and not(@bayName)]`,
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: async () => ({ assertOn: 'source' }) })
})
