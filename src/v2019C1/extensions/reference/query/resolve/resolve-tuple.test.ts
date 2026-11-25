import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ResolvedTuplePair, TupleReferenceDraft } from './resolve-tuple.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// S1 holds no LNode; IED7 holds XCBR2, a GOOSE C1 and both a GOOSE and a report named C2; IED8 holds CSWI1 and the inputs an ExtRef sits in
const IEDS = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1"/>
		<IED name="IED7" uuid="ied7" ${id}="ied7">
			<AccessPoint name="AP1" uuid="ap7" ${id}="ap7">
				<Server ${id}="server7">
					<Authentication ${id}="auth7"/>
					<LDevice inst="LD1" uuid="ld7" ${id}="ld7">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln07" ${id}="ln07">
							<GSEControl name="C1" appID="C1" confRev="1" uuid="gc1" ${id}="gc1"/>
							<GSEControl name="C2" appID="C2" confRev="1" uuid="gc2" ${id}="gc2"/>
							<ReportControl name="C2" confRev="1" uuid="rc2" ${id}="rc2"><OptFields ${id}="opt2"/></ReportControl>
						</LN0>
						<LN lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="xcbr2" ${id}="xcbr2"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<IED name="IED8" uuid="ied8" ${id}="ied8">
			<AccessPoint name="AP1" uuid="ap8" ${id}="ap8">
				<Server ${id}="server8">
					<Authentication ${id}="auth8"/>
					<LDevice inst="LD1" uuid="ld8" ${id}="ld8">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln08" ${id}="ln08">
							<Inputs ${id}="in8"/>
						</LN0>
						<LN lnClass="CSWI" inst="1" lnType="CSWI_T" uuid="cswi8" ${id}="cswi8"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="templates">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lln0-type"><DO name="Beh" type="ENS_T" ${id}="beh"/></LNodeType>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
			<LNodeType id="CSWI_T" lnClass="CSWI" ${id}="cswi-type"><DO name="Pos" type="DPC_T" ${id}="cswi-pos"/></LNodeType>
			<DOType id="ENS_T" cdc="ENS" ${id}="ens-type"><DA name="stVal" bType="Enum" type="Beh_E" fc="ST" ${id}="beh-st"/></DOType>
			<DOType id="DPC_T" cdc="DPC" ${id}="dpc-type"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="pos-st"/></DOType>
			<EnumType id="Beh_E" ${id}="beh-enum"><EnumVal ord="1" ${id}="on">on</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>
`

const IED8_INPUTS = { tagName: 'Inputs', id: 'in8' } as Scl.Ref<Scl.ElementsOf>

describe("query.reference.resolveTuple answers the element a tuple reference's names name", () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		reference: TupleReferenceDraft
		parent: Scl.Ref<Scl.ElementsOf>
		expected: ResolvedTuplePair[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED8's inputs; the names name IED7's XCBR2 and its GOOSE C1, one each
		"an ExtRef's names naming one logical node and one control block → both elements": {
			sourceXml: IEDS,
			reference: {
				tagName: 'ExtRef',
				attributes: {
					iedName: 'IED7',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '2',
					doName: 'Pos',
					srcLDInst: 'LD1',
					srcLNClass: 'LLN0',
					srcCBName: 'C1',
					intAddr: 'pos2',
				},
			},
			parent: IED8_INPUTS,
			expected: [
				{ uuidAttribute: 'lnUuid', uuid: 'xcbr2', target: { tagName: 'LN', id: 'xcbr2' } },
				{ uuidAttribute: 'srcCBUuid', uuid: 'gc1', target: { tagName: 'GSEControl', id: 'gc1' } },
			],
		},
		// IED7 holds no XCBR9
		'names naming no element → nothing for that pair': {
			sourceXml: IEDS,
			reference: {
				tagName: 'ExtRef',
				attributes: {
					iedName: 'IED7',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '9',
					doName: 'Pos',
					intAddr: 'pos9',
				},
			},
			parent: IED8_INPUTS,
			expected: [],
		},
		// IED7's GOOSE C2 and report C2 share the name; the input says no service
		'names two elements share → nothing for that pair': {
			sourceXml: IEDS,
			reference: {
				tagName: 'ExtRef',
				attributes: {
					iedName: 'IED7',
					ldInst: 'LD1',
					lnClass: 'XCBR',
					lnInst: '2',
					doName: 'Pos',
					srcLDInst: 'LD1',
					srcLNClass: 'LLN0',
					srcCBName: 'C2',
					intAddr: 'pos2',
				},
			},
			parent: IED8_INPUTS,
			expected: [
				{ uuidAttribute: 'lnUuid', uuid: 'xcbr2', target: { tagName: 'LN', id: 'xcbr2' } },
			],
		},
		// IED8's inputs; "@" names the IED the input sits in, which holds CSWI1
		'a reference naming its IED by where it sits → resolved under the parent given': {
			sourceXml: IEDS,
			reference: {
				tagName: 'ExtRef',
				attributes: {
					iedName: '@',
					ldInst: 'LD1',
					lnClass: 'CSWI',
					lnInst: '1',
					doName: 'Pos',
					intAddr: 'own',
				},
			},
			parent: IED8_INPUTS,
			expected: [
				{ uuidAttribute: 'lnUuid', uuid: 'cswi8', target: { tagName: 'LN', id: 'cswi8' } },
			],
		},
		// S1 gets an LNode naming IED7's XCBR2: an LNode is bound by its uuid only
		'an LNode naming a logical node by its names → nothing': {
			sourceXml: IEDS,
			reference: {
				tagName: 'LNode',
				attributes: { iedName: 'IED7', ldInst: 'LD1', lnClass: 'XCBR', lnInst: '2' },
			},
			parent: { tagName: 'Substation', id: 's1' } as Scl.Ref<Scl.ElementsOf>,
			expected: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		await expect(
			source.query.reference.resolveTuple({
				reference: testCase.reference,
				parent: testCase.parent,
			}),
		).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
