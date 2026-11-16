import { resolveMappedLNodes } from './resolve-mapped-lnodes'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { MappedLNode } from './resolve-mapped-lnodes.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	lnodes: readonly string[]
	expected: Record<string, MappedLNode>
}

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

describe('resolveMappedLNodes - names that address no logical node', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no lnUuid, names without a logical device → nothing': {
			allowIncoherentReferences:
				'the LNode is bound by names that name no logical device: what the read answers then',
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<!-- no ldInst -->
						<LNode iedName="IED1" lnClass="XCBR" lnInst="1" ${ID}="lnode"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" ${ID}="native-ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			lnodes: ['lnode'],
			expected: {},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const lnodes = testCase.lnodes.map((id) => ({ tagName: 'LNode' as const, id }))
		const mapped = await resolveMappedLNodes(source.query, { lnodes })
		expect(Object.fromEntries(mapped)).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
