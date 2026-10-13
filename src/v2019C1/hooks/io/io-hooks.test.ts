import { createSclIoHooks } from './io-hooks'

import { describe, it, expect } from 'vitest'

import { Scl, SCL_NAMESPACES } from '@/v2019C1/config'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

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

describe('import of a reference holding its uuid only', () => {
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
