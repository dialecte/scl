import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type NamingCase = SclTest.BaseXmlTestCase & {
	/** The groups the report lists: `<change> <tag>`, sorted. */
	groups: string[]
}

// The specified naming of an LNode the project specified on an IED names that IED and its logical device, as the
// commit writes them: an update of its function does not list the template's placeholder as a change.
describe('query.lifecycle.report - an FSD update of a function whose LNode is specified on an IED', () => {
	const testCases: SclTest.TestCases<NamingCase> = {
		'the template naming its LNode on no IED, the project specifying it on IED1 → no group': {
			sourceXml: /* xml */ `
					<SCL ${ns} ${id}="fsd">
						<Header id="F" uuid="f0000000-0000-4000-8000-000000000090"/>
						<Substation name="TEMPLATE" uuid="a1000000-0000-4000-8000-000000000001">
							<VoltageLevel name="TEMPLATE" uuid="a1000000-0000-4000-8000-000000000002">
								<Bay name="TEMPLATE" uuid="a1000000-0000-4000-8000-000000000003">
									<Function name="Control" uuid="a1000000-0000-4000-8000-000000000004" ${id}="fn-s">
										<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_T" uuid="a1000000-0000-4000-8000-000000000005">
											<Private type="eIEC61850-6-100">
												<eIEC61850-6-100:LNodeSpecNaming sIedName="None" sLnClass="CSWI" sLnInst="1"/>
											</Private>
										</LNode>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
						<DataTypeTemplates>
							<LNodeType id="CSWI_T" lnClass="CSWI"><DO name="Pos" type="DPC_T"/></LNodeType>
							<DOType id="DPC_T" cdc="DPC"><DA name="stVal" bType="BOOLEAN" fc="ST"/></DOType>
						</DataTypeTemplates>
					</SCL>
				`,
			targetXml: /* xml */ `
					<SCL ${ns} ${id}="scd">
						<Header id="P" uuid="f0000000-0000-4000-8000-000000000091"/>
						<Substation name="S1" uuid="b1000000-0000-4000-8000-000000000001">
							<VoltageLevel name="V1" uuid="b1000000-0000-4000-8000-000000000002">
								<Bay name="B1" uuid="b1000000-0000-4000-8000-000000000003" ${id}="bay-t">
									<Function name="Control" templateUuid="a1000000-0000-4000-8000-000000000004" uuid="b1000000-0000-4000-8000-000000000004">
										<LNode iedName="IED1" ldInst="LD1" prefix="" lnClass="CSWI" lnInst="1" lnType="CSWI_T" lnUuid="b1000000-0000-4000-8000-000000000012" templateUuid="a1000000-0000-4000-8000-000000000005" uuid="b1000000-0000-4000-8000-000000000005">
											<Private type="eIEC61850-6-100">
												<eIEC61850-6-100:LNodeSpecNaming sIedName="IED1" sLdInst="LD1" sLnClass="CSWI" sLnInst="1"/>
											</Private>
										</LNode>
									</Function>
								</Bay>
							</VoltageLevel>
						</Substation>
						<IED name="IED1" uuid="b1000000-0000-4000-8000-000000000010">
							<AccessPoint name="AP1" uuid="b1000000-0000-4000-8000-000000000011">
								<Server>
									<Authentication/>
									<LDevice inst="LD1" uuid="b1000000-0000-4000-8000-000000000013">
										<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="b1000000-0000-4000-8000-000000000014"/>
										<LN lnClass="CSWI" inst="1" prefix="" lnType="CSWI_T" uuid="b1000000-0000-4000-8000-000000000012"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
						<DataTypeTemplates>
							<LNodeType id="LLN0_T" lnClass="LLN0"><DO name="Beh" type="ENS_T"/></LNodeType>
							<LNodeType id="CSWI_T" lnClass="CSWI"><DO name="Pos" type="DPC_T"/></LNodeType>
							<DOType id="ENS_T" cdc="ENS"><DA name="stVal" bType="Enum" fc="ST" type="Beh_T"/></DOType>
							<DOType id="DPC_T" cdc="DPC"><DA name="stVal" bType="BOOLEAN" fc="ST"/></DOType>
							<EnumType id="Beh_T"><EnumVal ord="1">on</EnumVal></EnumType>
						</DataTypeTemplates>
					</SCL>
				`,
			groups: [],
		},
	}

	async function act({ source, target, testCase }: SclTest.ActParams<NamingCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const report = await target.query.lifecycle.report({
			verb: 'fsd',
			sourceQuery: source.query,
			ref: { tagName: 'Function', id: 'fn-s' } as Scl.Ref<'Function'>,
			anchor: { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>,
			scenario: 'template',
		})
		const groups = report.instances
			.flatMap((instance) => instance.groups)
			.map((group) => `${group.change} ${group.primary.tagName}`)
		expect(groups.sort()).toEqual(testCase.groups)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
