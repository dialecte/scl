import { readImplementationTargetUuids } from './read-implementation-target-uuids'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	expected: Record<string, readonly string[]>
}

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = `${ALL_XMLNS_NAMESPACES} xmlns:vendor="urn:vendor"`

describe('readImplementationTargetUuids', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an IED holding an LN, an ExtRef, an ExtCtrl and a vendor copy of an LN → the native uuids per tag, the vendor copy left out':
			{
				sourceXml: /* xml */ `
					<SCL ${NS} ${ID}="root">
						<IED name="IED1" ${ID}="ied-1">
							<AccessPoint name="AP1" ${ID}="ap-1">
								<Server ${ID}="srv-1">
									<LDevice inst="LD0" ${ID}="ld-1">
										<Private type="vendor" ${ID}="payload">
											<vendor:LN lnClass="XCBR" inst="1" uuid="uuid-vendor-ln" ${ID}="vendor-ln"/>
										</Private>
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="uuid-ln0" ${ID}="ln0"/>
										<LN lnClass="PTRC" inst="1" lnType="PTRC_T" uuid="uuid-ptrc" ${ID}="ln-ptrc">
											<Inputs ${ID}="inputs">
												<ExtRef intAddr="Trip" uuid="uuid-ext-ref" ${ID}="ext-ref"/>
											</Inputs>
											<Outputs ${ID}="outputs">
												<ExtCtrl lnUuid="uuid-ptrc" doName="Op" uuid="uuid-ext-ctrl" ${ID}="ext-ctrl"/>
											</Outputs>
										</LN>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>`,
				expected: {
					LN0: ['uuid-ln0'],
					LN: ['uuid-ptrc'],
					ExtRef: ['uuid-ext-ref'],
					ExtCtrl: ['uuid-ext-ctrl'],
				},
			},

		'an LN held directly by an access point → its uuid read': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<LN lnClass="PTRC" inst="1" lnType="PTRC_T" uuid="uuid-ap-ln" ${ID}="ap-ln"/>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: { LN: ['uuid-ap-ln'] },
		},

		'an ExtRef in the inputs of an LN0 → its uuid read': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="uuid-ln0" ${ID}="ln0">
										<Inputs ${ID}="inputs">
											<ExtRef intAddr="Trip" uuid="uuid-ln0-ext-ref" ${ID}="ext-ref"/>
										</Inputs>
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: { LN0: ['uuid-ln0'], ExtRef: ['uuid-ln0-ext-ref'] },
		},

		'an LN of the document namespace inside a Private → left out': {
			sourceXml: /* xml */ `
				<SCL ${NS} ${ID}="root">
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<Private type="vendor" ${ID}="payload">
										<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="uuid-private-ln" ${ID}="private-ln"/>
									</Private>
									<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="uuid-ln0" ${ID}="ln0"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>`,
			expected: { LN0: ['uuid-ln0'] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			const uuidsByTag = await readImplementationTargetUuids(source.query)
			const read = Object.fromEntries(
				[...uuidsByTag].map(function sortedEntry([tagName, uuids]) {
					return [tagName, [...uuids].sort()]
				}),
			)
			expect(read).toEqual(testCase.expected)
		},
	})
})
