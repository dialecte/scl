import { resolveMappedLNode } from './resolve-mapped-lnode'

import { describe, expect } from 'vitest'

import { countQueryReads } from '@/v2019C1/test/count-query-reads'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const LN_UUID = '50000000-0000-4000-8000-000000000001'

describe('resolveMappedLNode reads', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'LNode with an lnUuid → no read of the whole document': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode-1"/>
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
				</SCL>`,
		},

		'LNode with names only → no read of the whole document': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" ${ID}="lnode-1"/>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" ${ID}="ln-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
		},
	}

	async function act({ source }: SclTest.ActParams<TestCase>): Promise<void> {
		const { query, reads } = countQueryReads(source.query)
		const lnode = await source.query.getRecord({ tagName: 'LNode', id: 'lnode-1' })
		const ln = await resolveMappedLNode(query, lnode as Scl.TrackedRecord<'LNode'>)
		expect(ln?.id).toBe('ln-1')
		expect(reads.filter((read) => read === 'findDescendants')).toEqual([])
	}

	runSclTestCases.withoutExport({ testCases, act })
})
