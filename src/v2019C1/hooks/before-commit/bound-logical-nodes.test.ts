import { readBoundLNodes } from './bound-logical-nodes'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// F1 to place LNodes in; P1 holds the logical node LD0/Q0XCBR2 (uuid `p1-breaker-uuid`) the LNodes are bound to.
const project = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="substation" name="S1">
			<Function ${id}="function" name="F1"/>
		</Substation>
		<IED ${id}="p1" name="P1">
			<AccessPoint ${id}="p1-ap" name="AP1">
				<Server ${id}="p1-server">
					<LDevice ${id}="p1-ld" inst="LD0">
						<LN0 ${id}="p1-lln0" lnClass="LLN0" inst="" lnType="LLN0_T"/>
						<LN ${id}="p1-breaker" prefix="Q0" lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="p1-breaker-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>`

// What the commit reads for the LNodes it binds is bounded by the IEDs they name, not by how many LNodes it binds.
describe('the commit reads the logical nodes the LNodes it binds name once', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** How many LNodes bound to Q0XCBR2 the transaction creates in F1, each with `lnode` as its other attributes. */
		lnodes: number
		lnode: Record<string, string>
		/** The reads made, in order. */
		expectedReads: string[]
	}

	// the elements above the named logical node, one level a read: its logical device, server, access point, IED
	const above = ['getRecords', 'getRecords', 'getRecords', 'getRecords']
	// the IEDs by tag, then down to the logical nodes of the one named, one level a read: access point, server, logical
	// device, logical node
	const down = ['getRecordsByTagName', 'getRecords', 'getRecords', 'getRecords', 'getRecords']
	const inNamedIed = ['getRecords', ...down, ...above]
	const sameNames = {
		reason: 'the LNodes name the one logical node they are bound to: the case is the reads',
		violations: [{ check: 'uniqueness' as const }],
	}

	const testCases: SclTest.TestCases<TestCase> = {
		"1 LNode naming the IED of its logical node → the LNodes read, the IEDs by tag, that IED's logical nodes, the elements above a level at a time":
			{
				sourceXml: project,
				lnodes: 1,
				lnode: { iedName: 'P1', ldInst: 'LD0', prefix: 'Q0', lnClass: 'XCBR', lnInst: '2' },
				expectedReads: inNamedIed,
			},
		'40 LNodes naming the IED of their logical node → the same reads as for 1': {
			sourceXml: project,
			allowInvalidOutput: sameNames,
			lnodes: 40,
			lnode: { iedName: 'P1', ldInst: 'LD0', prefix: 'Q0', lnClass: 'XCBR', lnInst: '2' },
			expectedReads: inNamedIed,
		},
		'40 LNodes with their lnUuid alone → the LNodes read, each logical node tag once, the elements above a level at a time':
			{
				sourceXml: project,
				allowInvalidOutput: sameNames,
				lnodes: 40,
				lnode: { lnClass: 'XCBR' },
				expectedReads: ['getRecords', 'findByAttributes', 'findByAttributes', ...above],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let made: string[] = []
			await source.transaction(async (tx) => {
				const functionRef = { tagName: 'Function', id: 'function' } as Scl.Ref<Scl.ElementsOf>
				const lnodeIds = new Set<string>()
				for (let index = 1; index <= testCase.lnodes; index++) {
					const lnode = await tx.addChild(functionRef, {
						tagName: 'LNode',
						attributes: { ...testCase.lnode, lnUuid: 'p1-breaker-uuid' },
					})
					lnodeIds.add(lnode.id)
				}
				const counted = countQueryReads(tx)
				await readBoundLNodes({ query: counted.query, lnodeIds })
				made = counted.reads
			})
			expect(made).toEqual(testCase.expectedReads)
		},
	})
})
