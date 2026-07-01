import { elementSignature } from './element-signature'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type Ref = { tagName: string; id: string }

type TestCase = SclTest.BaseXmlTestCase & {
	a: Ref
	b: Ref
	equal: boolean
	resolveReferences?: boolean
	ignoreAttributes?: readonly string[]
}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('elementSignature', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two EnumTypes with identical (ord,value) set but different id → equal': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<EnumType id="Beh1" ${id}="et-1">
						<EnumVal ord="1" ${id}="ev-1a">on</EnumVal>
						<EnumVal ord="2" ${id}="ev-1b">off</EnumVal>
					</EnumType>
					<EnumType id="Beh2" ${id}="et-2">
						<EnumVal ord="2" ${id}="ev-2b">off</EnumVal>
						<EnumVal ord="1" ${id}="ev-2a">on</EnumVal>
					</EnumType>
				</DataTypeTemplates>
			</SCL>`,
			a: { tagName: 'EnumType', id: 'et-1' },
			b: { tagName: 'EnumType', id: 'et-2' },
			equal: true,
		},

		'EnumTypes with a different value → different signature': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<EnumType id="Beh1" ${id}="et-1"><EnumVal ord="1" ${id}="ev-1a">on</EnumVal></EnumType>
					<EnumType id="Beh2" ${id}="et-2"><EnumVal ord="1" ${id}="ev-2a">blocked</EnumVal></EnumType>
				</DataTypeTemplates>
			</SCL>`,
			a: { tagName: 'EnumType', id: 'et-1' },
			b: { tagName: 'EnumType', id: 'et-2' },
			equal: false,
		},

		'EnumTypes differing only by id, with id NOT ignored → different signature': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<EnumType id="Beh1" ${id}="et-1"><EnumVal ord="1" ${id}="ev-1a">on</EnumVal></EnumType>
					<EnumType id="Beh2" ${id}="et-2"><EnumVal ord="1" ${id}="ev-2a">on</EnumVal></EnumType>
				</DataTypeTemplates>
			</SCL>`,
			a: { tagName: 'EnumType', id: 'et-1' },
			b: { tagName: 'EnumType', id: 'et-2' },
			ignoreAttributes: ['uuid'],
			equal: false,
		},

		'DOTypes referencing equal EnumTypes under different ids, references NOT resolved → different':
			{
				sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<DOType id="DO1" cdc="ENC" ${id}="dot-1"><DA name="stVal" bType="Enum" type="EnumA" fc="ST" ${id}="da-1"/></DOType>
					<DOType id="DO2" cdc="ENC" ${id}="dot-2"><DA name="stVal" bType="Enum" type="EnumB" fc="ST" ${id}="da-2"/></DOType>
					<EnumType id="EnumA" ${id}="et-a"><EnumVal ord="1" ${id}="ev-a">on</EnumVal></EnumType>
					<EnumType id="EnumB" ${id}="et-b"><EnumVal ord="1" ${id}="ev-b">on</EnumVal></EnumType>
				</DataTypeTemplates>
			</SCL>`,
				a: { tagName: 'DOType', id: 'dot-1' },
				b: { tagName: 'DOType', id: 'dot-2' },
				equal: false,
			},

		'DOTypes referencing equal EnumTypes under different ids, references resolved → equal': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<DOType id="DO1" cdc="ENC" ${id}="dot-1"><DA name="stVal" bType="Enum" type="EnumA" fc="ST" ${id}="da-1"/></DOType>
					<DOType id="DO2" cdc="ENC" ${id}="dot-2"><DA name="stVal" bType="Enum" type="EnumB" fc="ST" ${id}="da-2"/></DOType>
					<EnumType id="EnumA" ${id}="et-a"><EnumVal ord="1" ${id}="ev-a">on</EnumVal></EnumType>
					<EnumType id="EnumB" ${id}="et-b"><EnumVal ord="1" ${id}="ev-b">on</EnumVal></EnumType>
				</DataTypeTemplates>
			</SCL>`,
			a: { tagName: 'DOType', id: 'dot-1' },
			b: { tagName: 'DOType', id: 'dot-2' },
			resolveReferences: true,
			equal: true,
		},

		'DOTypes whose DA differs only by bType → different signature': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<DOType id="DOx" cdc="MV" ${id}="dot-x"><DA name="mag" bType="FLOAT32" fc="MX" ${id}="da-x"/></DOType>
					<DOType id="DOy" cdc="MV" ${id}="dot-y"><DA name="mag" bType="INT32" fc="MX" ${id}="da-y"/></DOType>
				</DataTypeTemplates>
			</SCL>`,
			a: { tagName: 'DOType', id: 'dot-x' },
			b: { tagName: 'DOType', id: 'dot-y' },
			equal: false,
		},

		'LNodeTypes differing only in a nested EnumType value, resolved → different (fork bubbles up)':
			{
				sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="LN1" lnClass="ENC" ${id}="lnt-1"><DO name="Beh" type="DOa" ${id}="do-1"/></LNodeType>
					<LNodeType id="LN2" lnClass="ENC" ${id}="lnt-2"><DO name="Beh" type="DOb" ${id}="do-2"/></LNodeType>
					<DOType id="DOa" cdc="ENS" ${id}="dot-a"><DA name="stVal" bType="Enum" type="EnA" fc="ST" ${id}="da-a"/></DOType>
					<DOType id="DOb" cdc="ENS" ${id}="dot-b"><DA name="stVal" bType="Enum" type="EnB" fc="ST" ${id}="da-b"/></DOType>
					<EnumType id="EnA" ${id}="en-a"><EnumVal ord="1" ${id}="va">on</EnumVal></EnumType>
					<EnumType id="EnB" ${id}="en-b"><EnumVal ord="1" ${id}="vb">blocked</EnumVal></EnumType>
				</DataTypeTemplates>
			</SCL>`,
				a: { tagName: 'LNodeType', id: 'lnt-1' },
				b: { tagName: 'LNodeType', id: 'lnt-2' },
				resolveReferences: true,
				equal: false,
			},

		'consumers referencing equal producers via uuid, resolved → equal (path companion ignored)': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<Substation name="S1" ${id}="sub-1">
					<Function name="F" ${id}="fn-1">
						<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="prod-a" ${id}="prodA"/>
						<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="prod-b" ${id}="prodB"/>
						<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="consA">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${id}="in-a">
									<eIEC61850-6-100:SourceRef input="Op" source="S1/F/XCBR1" sourceLNodeUuid="prod-a" sourceDoName="Pos" sourceDaName="stVal" ${id}="sr-a"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
						<LNode iedName="None" lnClass="PTOC" lnInst="1" ${id}="consB">
							<Private type="eIEC61850-6-100">
								<eIEC61850-6-100:LNodeInputs ${id}="in-b">
									<eIEC61850-6-100:SourceRef input="Op" source="OTHER/PATH/XCBR1" sourceLNodeUuid="prod-b" sourceDoName="Pos" sourceDaName="stVal" ${id}="sr-b"/>
								</eIEC61850-6-100:LNodeInputs>
							</Private>
						</LNode>
					</Function>
				</Substation>
			</SCL>`,
			a: { tagName: 'LNode', id: 'consA' },
			b: { tagName: 'LNode', id: 'consB' },
			resolveReferences: true,
			equal: true,
		},

		'DAs differing only by an explicit schema-default attribute → equal (default folded)': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<DOType id="DO1" cdc="SPS" ${id}="dot-1">
						<DA name="stVal" bType="BOOLEAN" fc="ST" dchg="false" ${id}="da-1"/>
					</DOType>
					<DOType id="DO2" cdc="SPS" ${id}="dot-2">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-2"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			a: { tagName: 'DOType', id: 'dot-1' },
			b: { tagName: 'DOType', id: 'dot-2' },
			equal: true,
		},

		'DAs differing by a non-default attribute value → different (only the default is folded)': {
			sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<DOType id="DO1" cdc="SPS" ${id}="dot-1">
						<DA name="stVal" bType="BOOLEAN" fc="ST" dchg="true" ${id}="da-1"/>
					</DOType>
					<DOType id="DO2" cdc="SPS" ${id}="dot-2">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-2"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			a: { tagName: 'DOType', id: 'dot-1' },
			b: { tagName: 'DOType', id: 'dot-2' },
			equal: false,
		},

		'two LNodeTypes whose DOs share one DOType in opposite child order, resolved → equal (no spurious @cycle)':
			{
				sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="LN1" lnClass="ENC" ${id}="lnt-1">
						<DO name="Beh" type="SharedD" ${id}="do-1a"/>
						<DO name="Mod" type="SharedD" ${id}="do-1b"/>
					</LNodeType>
					<LNodeType id="LN2" lnClass="ENC" ${id}="lnt-2">
						<DO name="Mod" type="SharedD" ${id}="do-2b"/>
						<DO name="Beh" type="SharedD" ${id}="do-2a"/>
					</LNodeType>
					<DOType id="SharedD" cdc="ENS" ${id}="dot-s"><DA name="stVal" bType="INT32" fc="ST" ${id}="da-s"/></DOType>
				</DataTypeTemplates>
			</SCL>`,
				a: { tagName: 'LNodeType', id: 'lnt-1' },
				b: { tagName: 'LNodeType', id: 'lnt-2' },
				resolveReferences: true,
				equal: true,
			},

		'LNodeTypes sharing a DOType vs pointing a member at a different DOType, resolved → different (no over-collapse)':
			{
				sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<LNodeType id="LN3" lnClass="ENS" ${id}="lnt-3">
						<DO name="Beh" type="Da" ${id}="do-3a"/>
						<DO name="Mod" type="Da" ${id}="do-3b"/>
					</LNodeType>
					<LNodeType id="LN4" lnClass="ENS" ${id}="lnt-4">
						<DO name="Beh" type="Da" ${id}="do-4a"/>
						<DO name="Mod" type="Db" ${id}="do-4b"/>
					</LNodeType>
					<DOType id="Da" cdc="ENS" ${id}="dot-da"><DA name="stVal" bType="INT32" fc="ST" ${id}="da-da"/></DOType>
					<DOType id="Db" cdc="ENS" ${id}="dot-db"><DA name="stVal" bType="FLOAT32" fc="MX" ${id}="da-db"/></DOType>
				</DataTypeTemplates>
			</SCL>`,
				a: { tagName: 'LNodeType', id: 'lnt-3' },
				b: { tagName: 'LNodeType', id: 'lnt-4' },
				resolveReferences: true,
				equal: false,
			},

		'two self-referential DOTypes (SDO → own DOType), resolved → equal via stable @cycle (no hang)':
			{
				sourceXml: /* xml */ `
			<SCL ${ns} ${id}="scl-1">
				<DataTypeTemplates ${id}="dtt-1">
					<DOType id="Rec1" cdc="WYE" ${id}="dot-r1"><SDO name="phsA" type="Rec1" ${id}="sdo-1"/></DOType>
					<DOType id="Rec2" cdc="WYE" ${id}="dot-r2"><SDO name="phsA" type="Rec2" ${id}="sdo-2"/></DOType>
				</DataTypeTemplates>
			</SCL>`,
				a: { tagName: 'DOType', id: 'dot-r1' },
				b: { tagName: 'DOType', id: 'dot-r2' },
				resolveReferences: true,
				equal: true,
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const options = {
				resolveReferences: testCase.resolveReferences ?? false,
				ignoreAttributes: testCase.ignoreAttributes,
			}
			const sigA = await elementSignature(source.query, {
				ref: testCase.a as Scl.Ref<Scl.ElementsOf>,
				...options,
			})
			const sigB = await elementSignature(source.query, {
				ref: testCase.b as Scl.Ref<Scl.ElementsOf>,
				...options,
			})

			if (testCase.equal) expect(sigA).toBe(sigB)
			else expect(sigA).not.toBe(sigB)
		},
	})
})
