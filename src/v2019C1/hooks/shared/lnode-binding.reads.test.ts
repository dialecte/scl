import { reconcileLNodeBinding } from './lnode-binding'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { readAttributes } from '@/v2019C1/helpers'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countDocumentQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** An IED `PIU` with two logical devices: `CTRL` holds an LN0 and two LNs, `PROT` one LN; an unbound LNode. */
const SOURCE_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<IED ${id}="ied1" name="PIU">
			<AccessPoint ${id}="ap1" name="AP1">
				<Server ${id}="srv1">
					<LDevice ${id}="ld1" inst="CTRL">
						<LN0 ${id}="ln0" lnClass="LLN0" inst="" lnType="LLN0_0" uuid="ln0-uuid"/>
						<LN ${id}="cswi2" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="cswi-uuid"/>
						<LN ${id}="xcbr1" lnClass="XCBR" inst="1" lnType="XCBR_0" uuid="shared-uuid"/>
					</LDevice>
					<LDevice ${id}="ld2" inst="PROT">
						<LN ${id}="ptrc1" lnClass="PTRC" inst="1" lnType="PTRC_0" uuid="ptrc-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<Substation ${id}="sub1" name="Sub1">
			<Function ${id}="f1" name="F1">
				<LNode ${id}="lnode1" iedName="None" lnClass="CSWI" lnInst="1" prefix=""/>
			</Function>
		</Substation>
	</SCL>
`

/** The document of `SOURCE_XML` with the `PROT` LN carrying the uuid of the `CTRL` XCBR. */
const SHARED_UUID_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<IED ${id}="ied1" name="PIU">
			<AccessPoint ${id}="ap1" name="AP1">
				<Server ${id}="srv1">
					<LDevice ${id}="ld1" inst="CTRL">
						<LN0 ${id}="ln0" lnClass="LLN0" inst="" lnType="LLN0_0" uuid="ln0-uuid"/>
						<LN ${id}="cswi2" lnClass="CSWI" inst="2" prefix="CB" lnType="CSWI_0" uuid="cswi-uuid"/>
						<LN ${id}="xcbr1" lnClass="XCBR" inst="1" lnType="XCBR_0" uuid="shared-uuid"/>
					</LDevice>
					<LDevice ${id}="ld2" inst="PROT">
						<LN ${id}="ptrc1" lnClass="PTRC" inst="1" lnType="PTRC_0" uuid="shared-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<Substation ${id}="sub1" name="Sub1">
			<Function ${id}="f1" name="F1">
				<LNode ${id}="lnode1" iedName="None" lnClass="CSWI" lnInst="1" prefix=""/>
			</Function>
		</Substation>
	</SCL>
`

const IDENTITY_NAMES = ['iedName', 'ldInst', 'prefix', 'lnClass', 'lnInst'] as const

/**
 * Binding an LNode to a logical node by `lnUuid` stamps the identity of the logical node the uuid names, looked up by
 * value (one lookup per tag, LN then LN0), never by reading the whole LN or LN0 tag.
 */
describe('reconcileLNodeBinding - the logical node an lnUuid names', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnUuid: string
		/** Writes the transaction makes before the binding. */
		before?: (tx: Core.Transaction<Config>) => Promise<void>
		expected: {
			identity: Partial<Record<(typeof IDENTITY_NAMES)[number], string>> | null
			tagReads: number
			lookups: string[]
		}
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an lnUuid naming an LN → its identity, one LN lookup, no tag read': {
			sourceXml: SOURCE_XML,
			lnUuid: 'cswi-uuid',
			expected: {
				identity: { iedName: 'PIU', ldInst: 'CTRL', prefix: 'CB', lnClass: 'CSWI', lnInst: '2' },
				tagReads: 0,
				lookups: ['LN'],
			},
		},
		'an lnUuid naming an LN0 → its identity, the LN then the LN0 lookup': {
			sourceXml: SOURCE_XML,
			lnUuid: 'ln0-uuid',
			expected: {
				identity: { iedName: 'PIU', ldInst: 'CTRL', lnClass: 'LLN0', lnInst: '' },
				tagReads: 0,
				lookups: ['LN', 'LN0'],
			},
		},
		'an lnUuid two LNs carry → the first the LN tag answers, as the tag read did': {
			// the PROT LN carries the uuid of the CTRL XCBR
			sourceXml: SHARED_UUID_XML,
			allowInvalidFixture: {
				reason: 'two LNs carry one uuid: the binding keeps the first, as before',
				violations: [{ check: 'identity', code: 'duplicate-instance-uuid' }],
			},
			lnUuid: 'shared-uuid',
			expected: {
				// the store answers a tag in id order: ptrc1 before xcbr1
				identity: { iedName: 'PIU', ldInst: 'PROT', lnClass: 'PTRC', lnInst: '1' },
				tagReads: 0,
				lookups: ['LN'],
			},
		},
		'an lnUuid naming nothing → no identity, both lookups': {
			sourceXml: SOURCE_XML,
			lnUuid: 'uuid-of-nothing',
			expected: { identity: null, tagReads: 0, lookups: ['LN', 'LN0'] },
		},
		'an LN the transaction renamed and moved its prefix → the staged identity': {
			sourceXml: SOURCE_XML,
			lnUuid: 'cswi-uuid',
			before: async (tx) => {
				await tx.update({ tagName: 'LN', id: 'cswi2' }, { attributes: { prefix: 'QA', inst: '7' } })
				await tx.update({ tagName: 'LDevice', id: 'ld1' }, { attributes: { inst: 'BAY' } })
			},
			expected: {
				identity: { iedName: 'PIU', ldInst: 'BAY', prefix: 'QA', lnClass: 'CSWI', lnInst: '7' },
				tagReads: 0,
				lookups: ['LN'],
			},
		},
		'an LN the transaction added → its identity': {
			sourceXml: SOURCE_XML,
			lnUuid: 'added-uuid',
			before: async (tx) => {
				await tx.addChild(
					{ tagName: 'LDevice', id: 'ld2' },
					{
						tagName: 'LN',
						attributes: { lnClass: 'MMXU', inst: '3', lnType: 'MMXU_0', uuid: 'added-uuid' },
					},
				)
			},
			expected: {
				identity: { iedName: 'PIU', ldInst: 'PROT', lnClass: 'MMXU', lnInst: '3' },
				tagReads: 0,
				lookups: ['LN'],
			},
		},
		'an LN the transaction deleted → no identity': {
			sourceXml: SOURCE_XML,
			lnUuid: 'cswi-uuid',
			before: async (tx) => {
				await tx.delete({ tagName: 'LN', id: 'cswi2' })
			},
			expected: { identity: null, tagReads: 0, lookups: ['LN', 'LN0'] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let observed: unknown
			await source.transaction(async (tx) => {
				await testCase.before?.(tx)
				const stored = await tx.getRecord({ tagName: 'LNode', id: 'lnode1' })
				const oldRecord = toRawRecord(stored!) as Scl.RawRecord<Scl.ElementsOf>
				const newRecord = {
					...oldRecord,
					attributes: [...oldRecord.attributes, { name: 'lnUuid', value: testCase.lnUuid }],
				} as Scl.RawRecord<Scl.ElementsOf>
				const { query, calls } = countDocumentQueryReads(tx)
				const operations = await reconcileLNodeBinding({ query, oldRecord, newRecord })
				const lnode = operations.findLast(
					(operation) => operation.newRecord?.id === 'lnode1',
				)?.newRecord
				const attributes = lnode && readAttributes({ record: lnode, defaults: 'none' })
				// the naming the LNode is left with, an attribute removed left out; null when the LNode is not written
				const identity = attributes
					? Object.fromEntries(
							IDENTITY_NAMES.flatMap((name) =>
								attributes[name] === undefined ? [] : [[name, attributes[name]]],
							),
						)
					: null
				const tagReads = calls().filter((call) => call.method === 'getRecordsByTagName').length
				const lookups = calls()
					.filter((call) => call.method === 'findByAttributes')
					.map((call) => (call.args[0] as { tagName: string }).tagName)
					.filter((tagName) => tagName === 'LN' || tagName === 'LN0')
				observed = { identity, tagReads, lookups }
			})
			expect(observed).toEqual(testCase.expected)
		},
	})
})
