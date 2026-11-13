import { writeTupleNamesOfCreatedTargets } from './tuple-names'

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

// What the commit reads is bounded by the tags that name a created target, not by how many were created.
describe('the commit reads the references of a created target once', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** How many logical nodes the transaction adds to the logical device of P2. */
		logicalNodes: number
		/** The reads the commit makes: the created records, then each referrer tag, once. */
		expectedReads: string[]
	}

	// the same reads for 1 and for 40 created logical nodes
	const testCases: SclTest.TestCases<TestCase> = {
		'1 logical node created, named by an ExtRef → the created records read once, each tag naming a logical node read once, the elements above the named one read a level at a time':
			{
				sourceXml: FIRST_NEW_LN_EXT_REF,
				logicalNodes: 1,
				allowIncoherentReferences: 'the logical nodes the ExtRef names are created by the case',
				expectedReads: [
					'getRecords',
					'getRecordsByTagName:Association',
					'getRecordsByTagName:ClientLN',
					'getRecordsByTagName:ExtCtrl',
					'getRecordsByTagName:ExtRef',
					'getRecordsByTagName:FCDA',
					'getRecordsByTagName:IEDName',
					// the elements above the named logical node, one level a read: its logical device, server, access point, IED
					'getRecords',
					'getRecords',
					'getRecords',
					'getRecords',
				],
			},
		'40 logical nodes created, one named by an ExtRef → the created records read once, each tag naming a logical node read once, the elements above the named one read a level at a time':
			{
				sourceXml: FIRST_NEW_LN_EXT_REF,
				logicalNodes: 40,
				allowIncoherentReferences: 'the logical nodes the ExtRef names are created by the case',
				expectedReads: [
					'getRecords',
					'getRecordsByTagName:Association',
					'getRecordsByTagName:ClientLN',
					'getRecordsByTagName:ExtCtrl',
					'getRecordsByTagName:ExtRef',
					'getRecordsByTagName:FCDA',
					'getRecordsByTagName:IEDName',
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
				await writeTupleNamesOfCreatedTargets({
					operations: tx.getStagedOperations(),
					query: counted.query,
				})
				reads = counted.calls.map(({ method, args }) =>
					method === 'getRecordsByTagName' ? [method, String(args[0])].join(':') : method,
				)
			})
			expect(reads).toEqual(testCase.expectedReads)
		},
	})
})
