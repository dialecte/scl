import { resetLNodes } from './orphan-lnode-bindings'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	element: Scl.Ref<Scl.ElementsOf>
	expected: Record<string, string>
	removed: string
}

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = `${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor"`
const LN_UUID = '70000000-0000-4000-8000-000000000001'

describe('resetLNodes counts native logical nodes only', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'lnUuid carried only by a vendor LN → the LNode released': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="sub-1">
						<Function name="F1" ${ID}="f1">
							<LNode iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnUuid="${LN_UUID}" ${ID}="lnode"/>
						</Function>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload">
										<vendor:LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="vendor-ln"/>
									</Private>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			element: { tagName: 'LNode', id: 'lnode' },
			expected: { iedName: 'None' },
			removed: 'lnUuid',
		},

		'data mapped by uuid only to a vendor LN → its names removed': {
			allowIncoherentReferences: 'the only element carrying the uuid is in a vendor payload',
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<Substation name="S1" ${ID}="sub-1">
						<Function name="F1" ${ID}="f1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" ${ID}="lnode">
								<Private type="eIEC61850-6-100" ${ID}="lnode-extension">
									<eIEC61850-6-100:DOS name="Mod" mappedLnUuid="${LN_UUID}" ${ID}="dos"/>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload">
										<vendor:LN lnClass="XCBR" inst="1" uuid="${LN_UUID}" ${ID}="vendor-ln"/>
									</Private>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			element: { tagName: 'DOS', id: 'dos' },
			expected: { name: 'Mod' },
			removed: 'mappedLnUuid',
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		await source.transaction(async (tx) => {
			await resetLNodes(tx)
		})
		const attributes = await source.query.any.getAttributes(testCase.element)
		expect(attributes).toMatchObject(testCase.expected)
		expect(attributes).not.toHaveProperty(testCase.removed)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
