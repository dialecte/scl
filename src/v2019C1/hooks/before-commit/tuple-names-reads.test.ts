import { writeTupleNamesAtCommit } from './tuple-names'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const P2_LD = { tagName: 'LDevice', id: 'p2-ld' } as const

const NEW_LN = {
	prefix: 'Q1',
	lnClass: 'XCBR',
	inst: '1',
	lnType: 'XCBR_T',
	uuid: 'new-ln-uuid',
}

// P1 holds, in its inputs, an ExtRef naming the first new logical node (uuid `ln-uuid-1`) by other names; P2 holds the logical device `LD0`.
const FIRST_NEW_LN_EXT_REF = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<Inputs ${id}="p1-inputs">
								<ExtRef ${id}="subscription" lnUuid="ln-uuid-1" iedName="P9" ldInst="LD9" lnClass="MMXU" lnInst="7" doName="Pos" intAddr="Pos"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1">
				<Server ${id}="p2-server">
					<LDevice ${id}="p2-ld" inst="LD0"/>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>`

// What the commit reads is bounded by the tags and uuid attributes that name a created target, not by how many were
// created, nor by how many references the document holds.
describe('the commit reads the references of a created target once', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** How many logical nodes the transaction adds to the logical device of P2. */
		logicalNodes: number
		/** The reads the commit makes: the created records, then each referrer tag and uuid attribute, once. */
		expectedReads: string[]
	}

	// the same reads for 1 and for 40 created logical nodes
	const testCases: SclTest.TestCases<TestCase> = {
		'1 logical node created, named by an ExtRef → the created records read once, each tag naming a logical node looked up once by the created uuids, no whole tag read, the elements above the named one read a level at a time':
			{
				sourceXml: FIRST_NEW_LN_EXT_REF,
				logicalNodes: 1,
				allowIncoherentReferences: 'the logical nodes the ExtRef names are created by the case',
				expectedReads: [
					'getRecords',
					'findByAttributes:Association:lnUuid',
					'findByAttributes:ClientLN:lnUuid',
					'findByAttributes:ExtCtrl:lnUuid',
					'findByAttributes:ExtRef:lnUuid',
					'findByAttributes:FCDA:lnUuid',
					'findByAttributes:IEDName:lnUuid',
					// the elements above the named logical node, one level a read: its logical device, server, access point, IED
					'getRecords',
					'getRecords',
					'getRecords',
					'getRecords',
				],
			},
		'40 logical nodes created, one named by an ExtRef → the created records read once, each tag naming a logical node looked up once by the created uuids, no whole tag read, the elements above the named one read a level at a time':
			{
				sourceXml: FIRST_NEW_LN_EXT_REF,
				logicalNodes: 40,
				allowIncoherentReferences: 'the logical nodes the ExtRef names are created by the case',
				expectedReads: [
					'getRecords',
					'findByAttributes:Association:lnUuid',
					'findByAttributes:ClientLN:lnUuid',
					'findByAttributes:ExtCtrl:lnUuid',
					'findByAttributes:ExtRef:lnUuid',
					'findByAttributes:FCDA:lnUuid',
					'findByAttributes:IEDName:lnUuid',
					// the elements above the named logical node, one level a read: its logical device, server, access point, IED
					'getRecords',
					'getRecords',
					'getRecords',
					'getRecords',
				],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let reads: string[] = []
			await source.transaction(async (tx) => {
				for (let index = 1; index <= testCase.logicalNodes; index++) {
					await tx.any.addChild(P2_LD, {
						tagName: 'LN',
						attributes: { ...NEW_LN, inst: String(index), uuid: 'ln-uuid-' + String(index) },
					})
				}
				const counted = countQueryReads(tx)
				await writeTupleNamesAtCommit({
					operations: tx.getStagedOperations(),
					query: counted.query,
					bound: { lnodes: [], logicalNodesByUuid: new Map() },
					pending: new Map(),
				})
				reads = counted.calls.map(readName)
			})
			expect(reads).toEqual(testCase.expectedReads)
		},
	})
})

// P1's IEDName names P2's logical device by `ldUuid` and P2's logical node by `lnUuid`, both created by the case, with
// stale names; P1's second IEDName names neither.
const IED_NAME_OF_TWO_TARGETS = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<GSEControl ${id}="p1-gse" name="CB1" appID="A1">
								<IEDName ${id}="both" ldUuid="new-ld-uuid" lnUuid="new-ln-uuid" apRef="AP9" ldInst="LD9" lnClass="MMXU" lnInst="7">P9</IEDName>
								<IEDName ${id}="neither" ldUuid="other-ld-uuid" apRef="AP1" ldInst="LD5">P5</IEDName>
							</GSEControl>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED ${id}="p2" name="P2">
			<AccessPoint ${id}="p2-ap" name="AP1">
				<Server ${id}="p2-server"/>
			</AccessPoint>
		</IED>
	</SCL>`

// A reference naming created targets of two kinds by two uuid attributes is found by both lookups: it is written once,
// with the names of both, and the lookup of each attribute uses the uuids of its own kind only.
describe('the commit looks up a reference naming two created targets by two uuid attributes once', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expectedReads: string[]
		/** The IEDNames the commit writes, by id, with the names written. */
		expectedWrites: Record<string, Record<string, string>>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a logical device and a logical node created, one IEDName naming both by ldUuid and lnUuid → looked up by both attributes, written once with the names of both':
			{
				sourceXml: IED_NAME_OF_TWO_TARGETS,
				allowIncoherentReferences:
					'the logical device and node the IEDName names are created by the case',
				expectedReads: [
					'getRecords',
					'findByAttributes:Association:lnUuid',
					'findByAttributes:ClientLN:lnUuid',
					'findByAttributes:ExtCtrl:lnUuid',
					'findByAttributes:ExtRef:lnUuid',
					'findByAttributes:FCDA:lnUuid',
					'findByAttributes:IEDName:ldUuid',
					'findByAttributes:IEDName:lnUuid',
					// the elements above the created logical device, one level a read: its server, access point, IED
					'getRecords',
					'getRecords',
					'getRecords',
				],
				expectedWrites: {
					both: { ldInst: 'LD1', lnClass: 'XCBR', lnInst: '1', prefix: 'Q1' },
				},
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let reads: string[] = []
			let writes: Record<string, Record<string, string>> = {}
			await source.transaction(async (tx) => {
				const ld = await tx.any.addChild(
					{ tagName: 'Server', id: 'p2-server' },
					{
						tagName: 'LDevice',
						attributes: { inst: 'LD1', uuid: 'new-ld-uuid' },
					},
				)
				await tx.any.addChild(ld, { tagName: 'LN', attributes: NEW_LN })
				const counted = countQueryReads(tx)
				const operations = await writeTupleNamesAtCommit({
					operations: tx.getStagedOperations(),
					query: counted.query,
					bound: { lnodes: [], logicalNodesByUuid: new Map() },
					pending: new Map(),
				})
				reads = counted.calls.map(readName)
				writes = Object.fromEntries(
					operations.flatMap((operation) =>
						operation.status === 'updated'
							? [
									[
										operation.newRecord.id,
										writtenNames({
											names: Object.keys(testCase.expectedWrites[operation.newRecord.id] ?? {}),
											record: operation.newRecord,
										}),
									],
								]
							: [],
					),
				)
			})
			expect({ reads, writes }).toEqual({
				reads: testCase.expectedReads,
				writes: testCase.expectedWrites,
			})
		},
	})
})

/** A read as the cases name it: the method, with the tag read or looked up and the attributes looked up by. */
function readName(params: { method: string; args: unknown[] }): string {
	const { method, args } = params
	if (method === 'getRecordsByTagName') return [method, String(args[0])].join(':')
	if (method === 'findByAttributes') {
		const { tagName, attributes } = args[0] as {
			tagName: string
			attributes: Record<string, unknown>
		}
		return [method, tagName, Object.keys(attributes).join(',')].join(':')
	}
	return method
}

/** The values a record holds for some attribute names. */
function writtenNames(params: {
	names: readonly string[]
	record: { attributes: readonly { name: string; value: string }[] }
}): Record<string, string> {
	const { names, record } = params
	return Object.fromEntries(
		names.map((name) => [
			name,
			record.attributes.find((attribute) => attribute.name === name)?.value ?? '',
		]),
	)
}
