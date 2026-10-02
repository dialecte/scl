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
				</SCL>
			`,
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
				</SCL>
			`,
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
				</SCL>
			`,
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
				</SCL>
			`,
			target: { tagName: 'LNode', id: 'lnode-a' },
			expectedReferrers: [{ tagName: 'ControlRef', id: 'cref-1' }],
		},

		'unsupported-resolution ref discovered by uuid → VariableApplyTo pointing at a Function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="sub-1">
						<Private type="eIEC61850-6-100" ${id}="sub-priv-1">
							<eIEC61850-6-100:Variable name="V1" ${id}="var-1">
								<eIEC61850-6-100:VariableApplyTo element="S1/F1" elementUuid="uuid-fn1" ${id}="vat-1"/>
							</eIEC61850-6-100:Variable>
						</Private>
						<Function name="F1" uuid="uuid-fn1" ${id}="fn-1"/>
					</Substation>
				</SCL>
			`,
			target: { tagName: 'Function', id: 'fn-1' },
			expectedReferrers: [{ tagName: 'VariableApplyTo', id: 'vat-1' }],
		},
	}

	testCases['LN target → the DOS/SDS/DAS it implements, by their own pair and by their default'] = {
		sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation ${id}="sub" name="S1">
					<Function ${id}="fn" name="F1">
						<LNode ${id}="lnode-ptoc" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
							<Private ${id}="priv-ptoc" type="eIEC61850-6-100">
								<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>
								<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid">
									<eIEC61850-6-100:DAS ${id}="das-ctl" name="ctlModel"/>
								</eIEC61850-6-100:DOS>
								<eIEC61850-6-100:DOS ${id}="dos-str" name="Str" mappedDoName="Ind1" mappedLnUuid="ggio1-uuid">
									<eIEC61850-6-100:DAS ${id}="das-general" name="general"/>
								</eIEC61850-6-100:DOS>
							</Private>
						</LNode>
						<LNode ${id}="lnode-ggio" iedName="VENDOR" ldInst="LD0" lnClass="GGIO" lnInst="1" lnUuid="ggio1-uuid">
							<Private ${id}="priv-ggio" type="eIEC61850-6-100">
								<eIEC61850-6-100:DOS ${id}="dos-beh" name="Beh" mappedDoName="Beh" mappedLnUuid="ptoc1-uuid">
									<eIEC61850-6-100:DAS ${id}="das-beh-stval" name="stVal"/>
								</eIEC61850-6-100:DOS>
								<eIEC61850-6-100:DOS ${id}="dos-ind" name="Ind1"/>
							</Private>
						</LNode>
					</Function>
				</Substation>
				<IED ${id}="ied" name="VENDOR">
					<AccessPoint ${id}="ap" name="AP1">
						<Server ${id}="srv">
							<LDevice ${id}="ld" inst="LD0">
								<LN ${id}="ptoc1" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc1-uuid"/>
								<LN ${id}="ggio1" lnClass="GGIO" inst="1" lnType="GGIO_T" uuid="ggio1-uuid"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>
		`,
		target: { tagName: 'LN', id: 'ptoc1' },
		expectedReferrers: [
			{ tagName: 'DOS', id: 'dos-op' },
			{ tagName: 'DOS', id: 'dos-mod' },
			{ tagName: 'DAS', id: 'das-ctl' },
			{ tagName: 'DOS', id: 'dos-beh' },
			{ tagName: 'DAS', id: 'das-beh-stval' },
		],
	}

	testCases['LN target, LNode mapped by identity only → the DOS following it'] = {
		sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation ${id}="sub" name="S1">
					<Function ${id}="fn" name="F1">
						<!-- no lnUuid -->
						<LNode ${id}="lnode-ptoc" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1">
							<Private ${id}="priv-ptoc" type="eIEC61850-6-100">
								<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>
							</Private>
						</LNode>
					</Function>
				</Substation>
				<IED ${id}="ied" name="VENDOR">
					<AccessPoint ${id}="ap" name="AP1">
						<Server ${id}="srv">
							<LDevice ${id}="ld" inst="LD0">
								<LN ${id}="ptoc1" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc1-uuid"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>
		`,
		target: { tagName: 'LN', id: 'ptoc1' },
		expectedReferrers: [{ tagName: 'DOS', id: 'dos-op' }],
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
