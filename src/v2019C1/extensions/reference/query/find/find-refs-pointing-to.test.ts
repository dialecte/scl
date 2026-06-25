import { findRefsPointingTo } from './find-refs-pointing-to'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type Referrer = { tagName: string; id: string }

type TestCase = SclTest.BaseXmlTestCase & {
	target: { tagName: string; id: string }
	expectedReferrers: Referrer[]
}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const byId = (a: Referrer, b: Referrer) => a.id.localeCompare(b.id)

describe('findRefsPointingTo', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'LNodeType target → LN and LNode referrers via lnType (other lnType ignored)': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<IED name="I1" ${id}="ied-1">
					<AccessPoint name="AP1" ${id}="ap-1">
						<Server ${id}="srv-1">
							<LDevice inst="LD0" ${id}="ld-1">
								<LN0 lnClass="LLN0" inst="" lnType="OTHER_Type" ${id}="ln0-1"/>
								<LN lnClass="CSWI" inst="1" lnType="CSWI_Type" ${id}="ln-1"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<Substation name="S1" ${id}="sub-1">
					<Function name="F1" ${id}="fn-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1"/>
					</Function>
				</Substation>
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-1"/>
					<LNodeType id="OTHER_Type" lnClass="LLN0" ${id}="lnt-2"/>
				</DataTypeTemplates>
			</SCL>`,
			target: { tagName: 'LNodeType', id: 'lnt-1' },
			expectedReferrers: [
				{ tagName: 'LN', id: 'ln-1' },
				{ tagName: 'LNode', id: 'lnode-1' },
			],
		},

		'DOType target → DO referrer via type': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-1">
						<DO name="Pos" type="DPC_Type" ${id}="do-1"/>
						<DO name="Beh" type="ENS_Type" ${id}="do-2"/>
					</LNodeType>
					<DOType id="DPC_Type" cdc="DPC" ${id}="dot-1"/>
					<DOType id="ENS_Type" cdc="ENS" ${id}="dot-2"/>
				</DataTypeTemplates>
			</SCL>`,
			target: { tagName: 'DOType', id: 'dot-1' },
			expectedReferrers: [{ tagName: 'DO', id: 'do-1' }],
		},

		'EnumType target → DA with bType=Enum matched; bType=Struct discriminator excluded': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<DOType id="ENS_Type" cdc="ENS" ${id}="dot-1">
						<DA name="stVal" bType="Enum" type="Beh_Enum" fc="ST" ${id}="da-enum"/>
						<DA name="q" bType="Quality" fc="ST" ${id}="da-q"/>
					</DOType>
					<DAType id="Vector" ${id}="dat-1">
						<BDA name="mag" bType="Struct" type="Beh_Enum" ${id}="bda-struct"/>
					</DAType>
					<EnumType id="Beh_Enum" ${id}="et-1">
						<EnumVal ord="1" ${id}="ev-1">on</EnumVal>
					</EnumType>
				</DataTypeTemplates>
			</SCL>`,
			target: { tagName: 'EnumType', id: 'et-1' },
			expectedReferrers: [{ tagName: 'DA', id: 'da-enum' }],
		},

		'uuid-pair target unaffected → ControlRef still resolved via controlledLNodeUuid': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="S1" ${id}="sub-1">
					<Function name="F1" ${id}="fn-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="uuid-ln1" ${id}="lnode-a"/>
						<LNode iedName="None" lnClass="CSWI" lnInst="1" ${id}="lnode-b">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeOutputs ${id}="lno-1">
									<eIEC61850-6-100:ControlRef controlled="S1/F1/XCBR1" controlledLNodeUuid="uuid-ln1" controlledDoName="Pos" ${id}="cref-1"/>
								</eIEC61850-6-100:LNodeOutputs>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>`,
			target: { tagName: 'LNode', id: 'lnode-a' },
			expectedReferrers: [{ tagName: 'ControlRef', id: 'cref-1' }],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await findRefsPointingTo(source.query, {
				target: testCase.target as Scl.Ref<Scl.ElementsOf>,
			})

			const got = result.map((r) => ({ tagName: r.ref.tagName, id: r.ref.id })).sort(byId)
			expect(got).toEqual([...testCase.expectedReferrers].sort(byId))
		},
	})
})
