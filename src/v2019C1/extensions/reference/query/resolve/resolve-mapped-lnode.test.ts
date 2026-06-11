import { resolveMappedLNode } from './resolve-mapped-lnode'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	lnodeId: string
	expected: { tagName: string; id: string } | null
}

describe('resolveMappedLNode', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<TestCase> = {
		'mapped LNode → implementing LN': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<VoltageLevel name="V1" ${ID}="vl-1">
						<Bay name="B1" ${ID}="bay-1">
							<LNode iedName="IED1" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1" ${ID}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="LD0" ${ID}="ld-1">
								<LN lnClass="XCBR" inst="1" prefix="" ${ID}="ln-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			lnodeId: 'lnode-1',
			expected: { tagName: 'LN', id: 'ln-1' },
		},

		'mapped LNode with prefix → implementing LN': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="IED1" ldInst="CTRL" prefix="P" lnClass="CSWI" lnInst="2" ${ID}="lnode-1"/>
					</Bay>
				</Substation>
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="CTRL" ${ID}="ld-1">
								<LN lnClass="CSWI" inst="2" prefix="P" ${ID}="ln-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			lnodeId: 'lnode-1',
			expected: { tagName: 'LN', id: 'ln-1' },
		},

		'unmapped LNode (iedName "None") → undefined': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="None" ldInst="" prefix="" lnClass="XCBR" lnInst="1" ${ID}="lnode-1"/>
					</Bay>
				</Substation>
			</SCL>`,
			lnodeId: 'lnode-1',
			expected: null,
		},

		'mapped LNode pointing to missing LN → undefined': {
			sourceXml: /* xml */ `
			<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
				<Substation name="S1" ${ID}="sub-1">
					<Bay name="B1" ${ID}="bay-1">
						<LNode iedName="IED1" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="9" ${ID}="lnode-1"/>
					</Bay>
				</Substation>
				<IED name="IED1" ${ID}="ied-1">
					<AccessPoint name="AP1" ${ID}="ap-1">
						<Server ${ID}="srv-1">
							<LDevice inst="LD0" ${ID}="ld-1">
								<LN lnClass="XCBR" inst="1" prefix="" ${ID}="ln-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>`,
			lnodeId: 'lnode-1',
			expected: null,
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const query = source.query

		const records = await query.getRecordsByTagName('LNode')
		const lnode = records.find((r) => r.id === testCase.lnodeId)
		expect(lnode).toBeDefined()

		const result = await resolveMappedLNode(query, lnode! as Scl.TrackedRecord<'LNode'>)

		if (testCase.expected === null) {
			expect(result).toBeUndefined()
		} else {
			expect(result).toBeDefined()
			expect(result!.tagName).toBe(testCase.expected.tagName)
			expect(result!.id).toBe(testCase.expected.id)
		}

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
