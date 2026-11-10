import { describe, expect } from 'vitest'

import { resetLNodes } from '@/v2019C1/extensions/clean-up/transaction/orphan-lnode-bindings'
import { ofEach } from '@/v2019C1/extensions/info/query/of-each'
import { findMappedDataFollowingLn } from '@/v2019C1/extensions/reference/query/find/find-mapped-data-following-ln'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const LN_UUID = '60000000-0000-4000-8000-000000000001'
const LNODES = [
	{ tagName: 'LNode', id: 'first' },
	{ tagName: 'LNode', id: 'second' },
	{ tagName: 'LNode', id: 'third' },
] as const

/** The reads that find a logical node from an LNode: a walk from the root, a lookup by uuid, or the read of them all. */
function lookUps(calls: readonly CountedQueryCall[]): {
	walks: number
	uuidLookups: number
	logicalNodeReads: number
} {
	return {
		walks: calls.filter((call) => call.method === 'getRoot').length,
		uuidLookups: calls.filter((call) => {
			if (call.method !== 'findByAttributes') return false
			const options = call.args[0] as { tagName?: string } | undefined
			return options?.tagName === 'LN' || options?.tagName === 'LN0'
		}).length,
		logicalNodeReads: calls.filter((call) => {
			if (call.method !== 'findDescendants') return false
			const options = call.args[1] as { collect?: readonly string[] } | undefined
			return options?.collect?.includes('LN') === true
		}).length,
	}
}

const DOCUMENT = /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<Function name="F1" ${ID}="f1">
							<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="first">
								<Private type="eIEC61850-6-100" ${ID}="first-extension">
									<eIEC61850-6-100:DOS name="Mod" ${ID}="first-dos"/>
								</Private>
							</LNode>
						</Function>
						<Function name="F2" ${ID}="f2">
							<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="second">
								<Private type="eIEC61850-6-100" ${ID}="second-extension">
									<eIEC61850-6-100:DOS name="Mod" ${ID}="second-dos"/>
								</Private>
							</LNode>
						</Function>
						<Function name="F3" ${ID}="f3">
							<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="third">
								<Private type="eIEC61850-6-100" ${ID}="third-extension">
									<eIEC61850-6-100:DOS name="Mod" ${ID}="third-dos"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="ln-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`

const ONE_READ = { walks: 0, uuidLookups: 0, logicalNodeReads: 1 }
/** The mapping of the LNodes, and the uuids its other references are judged against. */
const TWO_READS = { walks: 0, uuidLookups: 0, logicalNodeReads: 2 }

describe('callers looping over LNodes read the logical nodes once', () => {
	runSclTestCases.withoutExport({
		testCases: {
			'resetLNodes over three LNodes named into one logical node, two by uuid, all holding data → one read':
				{
					sourceXml: DOCUMENT,
				},
		},
		act: async ({ source }: SclTest.ActParams<TestCase>) => {
			const counted: CountedQueryCall[] = []
			await source.transaction(async (tx) => {
				const { query, calls } = countQueryReads(tx)
				await resetLNodes(query)
				counted.push(...calls)
			})
			expect(lookUps(counted)).toEqual(TWO_READS)
		},
	})

	runSclTestCases.withoutExport({
		testCases: {
			'ofEach over three LNodes named into one logical node, two by uuid, all holding data → one read':
				{ sourceXml: DOCUMENT },
		},
		act: async ({ source }: SclTest.ActParams<TestCase>) => {
			const { query, calls } = countQueryReads(source.query)
			await ofEach(query, LNODES)
			expect(lookUps(calls)).toEqual(ONE_READ)
		},
	})

	runSclTestCases.withoutExport({
		testCases: {
			'findMappedDataFollowingLn over three LNodes named into one logical node, two by uuid, all holding data → one read':
				{
					sourceXml: DOCUMENT,
				},
		},
		act: async ({ source }: SclTest.ActParams<TestCase>) => {
			const { query, calls } = countQueryReads(source.query)
			const ln = await source.query.getRecord({ tagName: 'LN', id: 'ln-1' })
			await findMappedDataFollowingLn(query, { ln: ln as Scl.TrackedRecord<'LN' | 'LN0'> })
			expect(lookUps(calls)).toEqual(ONE_READ)
		},
	})
})
