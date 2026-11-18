import { writeTupleNamesAtCommit } from './tuple-names'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const NEW_LN = { prefix: 'Q1', lnClass: 'XCBR', inst: '1', lnType: 'XCBR_T', uuid: 'new-ln-uuid' }

// P1's control block holds two IEDNames: `iedname-a` names, with stale names, P2's logical device and logical node by
// `ldUuid` and `lnUuid` (both created by the case); `iedname-b` names nothing yet, and the case makes it name both.
const TWO_IED_NAMES = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Header id="project"/>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T">
							<GSEControl ${id}="p1-gse" name="CB1" appID="A1">
								<IEDName ${id}="iedname-a" ldUuid="new-ld-uuid" lnUuid="new-ln-uuid" apRef="AP9" ldInst="LD9" lnClass="MMXU" lnInst="7">P9</IEDName>
								<IEDName ${id}="iedname-b" apRef="AP9" ldInst="LD8">P8</IEDName>
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

// References found by two lookups of one tag, one of them written by the transaction, are written in the order the tag
// read lists them: the tag is read once more for that order.
describe('the commit writes the references several lookups of one tag find in tag order', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		expectedReads: string[]
		/** The references the commit writes, in order. */
		expectedWritten: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'two IEDNames naming a created logical device and node, one of them made to by the transaction → the IEDName tag read once more, both written in tag order':
			{
				sourceXml: TWO_IED_NAMES,
				allowIncoherentReferences:
					'the logical device and node the IEDNames name are created by the case',
				expectedReads: [
					'getRecords',
					'findByAttributes:Association:lnUuid',
					'findByAttributes:ClientLN:lnUuid',
					'findByAttributes:ExtCtrl:lnUuid',
					'findByAttributes:ExtRef:lnUuid',
					'findByAttributes:FCDA:lnUuid',
					'findByAttributes:IEDName:ldUuid',
					'findByAttributes:IEDName:lnUuid',
					// the order of an IEDName the transaction wrote is known to the tag read only
					'getRecordsByTagName:IEDName',
					// the elements above the created logical device, one level a read: its server, access point, IED
					'getRecords',
					'getRecords',
					'getRecords',
				],
				expectedWritten: ['iedname-a', 'iedname-b'],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let reads: string[] = []
			let written: string[] = []
			await source.transaction(async (tx) => {
				const ld = await tx.any.addChild(
					{ tagName: 'Server', id: 'p2-server' },
					{ tagName: 'LDevice', attributes: { inst: 'LD1', uuid: 'new-ld-uuid' } },
				)
				await tx.any.addChild(ld, { tagName: 'LN', attributes: NEW_LN })
				await tx.any.update(
					{ tagName: 'IEDName', id: 'iedname-b' },
					{ attributes: { ldUuid: 'new-ld-uuid', lnUuid: 'new-ln-uuid' } },
				)
				const counted = countQueryReads(tx)
				const operations = await writeTupleNamesAtCommit({
					operations: tx.getStagedOperations(),
					query: counted.query,
					bound: { lnodes: [], logicalNodesByUuid: new Map() },
					pending: new Map(),
				})
				reads = counted.calls.map(readName)
				written = operations.flatMap((operation) =>
					operation.status === 'updated' ? [operation.newRecord.id] : [],
				)
			})
			expect({ reads, written }).toEqual({
				reads: testCase.expectedReads,
				written: testCase.expectedWritten,
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
