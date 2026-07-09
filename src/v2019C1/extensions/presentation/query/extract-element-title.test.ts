import { extractElementTitle } from './extract-element-title'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('extractElementTitle', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expectedTitle: string
		expectedLabels?: Record<string, Record<string, string>>
		mode?: 'compact' | 'full'
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// ── name-based (DEFINITION identityFields) ───────────────────
		'IED with name → name returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a"/>
				</SCL>
			`,
			ref: { tagName: 'IED', id: 'ied-a' },
			expectedTitle: 'IED_A',
		},
		'Bay with name → name returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="BAY1" ${id}="bay1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Bay', id: 'bay1' },
			expectedTitle: 'BAY1',
		},

		// ── inst-based ────────────────────────────────────────────────
		'LDevice with inst → inst returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap1">
							<Server ${id}="srv1">
								<LDevice inst="LD0" ${id}="ld0"/>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LDevice', id: 'ld0' },
			expectedTitle: 'LD0',
		},

		// ── override: composite LNode ─────────────────────────────────
		'LNode with prefix+lnClass+lnInst → concatenated title': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" ${id}="lnode-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-1' },
			expectedTitle: 'PXCBR1',
		},
		'LNode with empty prefix → lnClass+lnInst only': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="" lnClass="XCBR" lnInst="1" ${id}="lnode-2"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-2' },
			expectedTitle: 'XCBR1',
		},

		// ── override: composite LN ────────────────────────────────────
		'LN with prefix+lnClass+inst → concatenated title': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap1">
							<Server ${id}="srv1">
								<LDevice inst="LD0" ${id}="ld0">
									<LN prefix="P" lnClass="XCBR" inst="1" lnType="t1" ${id}="ln-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LN', id: 'ln-1' },
			expectedTitle: 'PXCBR1',
		},

		// ── override: ConnectedAP separator ──────────────────────────
		'ConnectedAP → iedName/apName': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Communication ${id}="comm">
						<SubNetwork name="NET" ${id}="net">
							<ConnectedAP iedName="IED_A" apName="AP1" ${id}="cap-1"/>
						</SubNetwork>
					</Communication>
				</SCL>
			`,
			ref: { tagName: 'ConnectedAP', id: 'cap-1' },
			expectedTitle: 'IED_A/AP1',
		},

		// ── override: type-based ──────────────────────────────────────
		'Private with type → type returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<Private type="ECIA.Plant.HMI" ${id}="priv-1"/>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'Private', id: 'priv-1' },
			expectedTitle: 'ECIA.Plant.HMI',
		},

		// ── fallback: unknown / no attributes ─────────────────────────
		'record not found → empty string': {
			sourceXml: /* xml */ `<SCL ${ns} ${id}="root"/>`,
			ref: { tagName: 'IED', id: 'does-not-exist' },
			expectedTitle: '',
		},

		// ── text-content (Phase 2) ────────────────────────────────────
		'Val with text content → record.value returned': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<DataTypeTemplates ${id}="dtt">
						<DOType id="DO1" cdc="ENC" ${id}="do1">
							<DA name="ctlModel" bType="Enum" type="CtlModels" fc="CF" ${id}="da1">
								<Val ${id}="v1">direct-with-normal-security</Val>
							</DA>
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			ref: { tagName: 'Val', id: 'v1' },
			expectedTitle: 'direct-with-normal-security',
		},
		'IEDName with text content → record.value returned (apRef ignored)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<Services ${id}="srv">
							<GSESettings ${id}="gses">
								<IEDName apRef="AP1" ${id}="iedname-1">P1</IEDName>
							</GSESettings>
						</Services>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'IEDName', id: 'iedname-1' },
			expectedTitle: 'P1',
		},

		// ── mode option (Phase 1) ─────────────────────────────────────
		'LNode in full mode → iedName/ldInst/PXCBR1': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<VoltageLevel name="VL1" ${id}="vl1">
							<Bay name="B1" ${id}="b1">
								<LNode iedName="IED_A" ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" ${id}="lnode-full"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode-full' },
			mode: 'full',
			expectedTitle: 'IED_A/LD0/PXCBR1',
		},

		// ── 90-30 simple *Ref (Phase 3) ───────────────────────────────
		'FunctionCatRef → function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:FunctionCatRef function="Sub1/F1" functionUuid="u1" ${id}="fcr1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'FunctionCatRef', id: 'fcr1' },
			expectedTitle: 'Sub1/F1',
		},

		// ── 90-30 composite (Phase 4) ─────────────────────────────────
		'ApplicationSclRef → fileUuid/fileType/version.revision': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:ApplicationSclRef ${id}="asr1">
							<eIEC61850-6-100:SclFileReference fileUuid="uuid-1" fileType="ICD" version="1" revision="A" ${id}="sfr1"/>
						</eIEC61850-6-100:ApplicationSclRef>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'ApplicationSclRef', id: 'asr1' },
			expectedTitle: 'ICD v1.A',
		},

		// ── 90-30 LNode family (Phase 5) ──────────────────────────────
		'LNodeSpecNaming → sIedName/sLdInst/sPrefix sLnClass sLnInst': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<DataTypeTemplates ${id}="dtt">
						<DOType id="DO1" cdc="ENC" ${id}="do1">
							<eIEC61850-6-100:LNodeSpecNaming sIedName="TEMPLATE" sLdInst="CBCB" sPrefix="P" sLnClass="XCBR" sLnInst="1" ${id}="lsn1"/>
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			ref: { tagName: 'LNodeSpecNaming', id: 'lsn1' },
			expectedTitle: 'TEMPLATE/CBCB/PXCBR1',
		},
		'SubscriberLNode compact → pLN/service': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<DataTypeTemplates ${id}="dtt">
						<DOType id="DO1" cdc="ENC" ${id}="do1">
							<eIEC61850-6-100:SubscriberLNode resourceName="PTRCCBR" inputName="Trip.general" service="GOOSE" pLN="XCBR" ${id}="sub1"/>
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			ref: { tagName: 'SubscriberLNode', id: 'sub1' },
			expectedTitle: 'XCBR(GOOSE)',
		},

		// ── 90-30 data-flow vars (Phase 6) ────────────────────────────
		'InputVar → varName // inputName': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:InputVar varName="trip_in" inputName="Trip.general" ${id}="iv1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'InputVar', id: 'iv1' },
			expectedTitle: 'trip_in:Trip.general',
		},
		'OutputVar → varName // outputName': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:OutputVar varName="cmd_out" outputName="Pos.Oper" ${id}="ov1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'OutputVar', id: 'ov1' },
			expectedTitle: 'cmd_out:Pos.Oper',
		},
		'LNodeInputRef → sourceRef': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:LNodeInputRef sourceRef="Sub1/Bay1/PTRC/Trip.general" ${id}="lir1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'LNodeInputRef', id: 'lir1' },
			expectedTitle: 'Sub1/Bay1/PTRC/Trip.general',
		},
		'LNodeOutputRef → controlRef': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:LNodeOutputRef controlRef="Sub1/Bay1/XCBR/Pos.Oper" ${id}="lor1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'LNodeOutputRef', id: 'lor1' },
			expectedTitle: 'Sub1/Bay1/XCBR/Pos.Oper',
		},

		// ── ExtRef compact (Phase 7) ──────────────────────────────────
		'ExtRef compact → iedName/ldInst/prefixlnClassinst.doName.daName': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap1">
							<Server ${id}="srv1">
								<LDevice inst="LD0" ${id}="ld0">
									<LN0 lnClass="LLN0" inst="" lnType="t0" ${id}="ln0">
										<Inputs ${id}="inputs1">
											<ExtRef iedName="IED_B" ldInst="LD1" prefix="P" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" ${id}="ext1"/>
										</Inputs>
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'ExtRef', id: 'ext1' },
			expectedTitle: 'IED_B/LD1/PXCBR1.Pos.stVal',
		},

		// ── FCDA (Phase 7) ────────────────────────────────────────────
		'FCDA compact → ldInst/prefixlnClassinst.doName.daName': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap1">
							<Server ${id}="srv1">
								<LDevice inst="LD0" ${id}="ld0">
									<LN0 lnClass="LLN0" inst="" lnType="t0" ${id}="ln0">
										<DataSet name="DS1" ${id}="ds1">
											<FCDA ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" fc="ST" ${id}="fcda1"/>
										</DataSet>
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'FCDA', id: 'fcda1' },
			expectedTitle: 'LD0/PXCBR1.Pos.stVal[ST]',
		},
		'FCDA full → with fc bracket': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<AccessPoint name="AP1" ${id}="ap1">
							<Server ${id}="srv1">
								<LDevice inst="LD0" ${id}="ld0">
									<LN0 lnClass="LLN0" inst="" lnType="t0" ${id}="ln0">
										<DataSet name="DS1" ${id}="ds1">
											<FCDA ldInst="LD0" prefix="P" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" fc="ST" ${id}="fcda2"/>
										</DataSet>
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'FCDA', id: 'fcda2' },
			mode: 'full',
			expectedTitle: 'LD0/PXCBR1.Pos.stVal[ST]',
		},

		// ── Labels (Phase 9) ──────────────────────────────────────
		'IED with Labels → labels map populated, title unchanged': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-with-labels">
						<Labels ${id}="lbls1">
							<Label lang="en" ${id}="l-en">Protection IED A</Label>
							<Label lang="fr" ${id}="l-fr">IED de protection A</Label>
						</Labels>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'IED', id: 'ied-with-labels' },
			expectedTitle: 'IED_A',
			expectedLabels: { en: { '': 'Protection IED A' }, fr: { '': 'IED de protection A' } },
		},
		'Element without Labels → empty labels map': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_B" ${id}="ied-no-labels"/>
				</SCL>
			`,
			ref: { tagName: 'IED', id: 'ied-no-labels' },
			expectedTitle: 'IED_B',
			expectedLabels: {},
		},
		'Label lang normalised to lowercase': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="sub-lbl">
						<Labels ${id}="lbls2">
							<Label lang="EN-US" ${id}="l-en-us">Substation One</Label>
						</Labels>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Substation', id: 'sub-lbl' },
			expectedTitle: 'S1',
			expectedLabels: { 'en-us': { '': 'Substation One' } },
		},
		'Labels with id attribute → nested [lang][id] map': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_C" ${id}="ied-multi-id">
						<Labels ${id}="lbls3">
							<Label lang="en" id="short" ${id}="l-en-short">Breaker</Label>
							<Label lang="en" id="long" ${id}="l-en-long">Circuit Breaker C</Label>
							<Label lang="fr" id="short" ${id}="l-fr-short">Disjoncteur</Label>
						</Labels>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'IED', id: 'ied-multi-id' },
			expectedTitle: 'IED_C',
			expectedLabels: {
				en: { short: 'Breaker', long: 'Circuit Breaker C' },
				fr: { short: 'Disjoncteur' },
			},
		},

		// ── Revised spec: composite refs ──────────────────────────────
		'ControlRef compact → output[outputInst]/pLN.pDO/controlled': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:ControlRef output="CMD" outputInst="1" pLN="CSWI" pDO="Pos" controlled="XCBR1" ${id}="cref1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'ControlRef', id: 'cref1' },
			expectedTitle: 'CMD[1]/CSWI.Pos/XCBR1',
		},
		'SourceRef compact → pLN.pDO.pDA': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:SourceRef service="GOOSE" inputInst="2" pLN="PTRC" pDO="Trip" pDA="general" source="Trip.general" ${id}="sref1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'SourceRef', id: 'sref1' },
			expectedTitle: 'PTRC.Trip.general',
		},
		'SourceRef full → service/Input[inputInst]/pLN.pDO.pDA/source': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:SourceRef service="GOOSE" inputInst="2" pLN="PTRC" pDO="Trip" pDA="general" source="Trip.general" ${id}="sref2"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'SourceRef', id: 'sref2' },
			mode: 'full',
			expectedTitle: 'GOOSE/Input[2]/PTRC.Trip.general/Trip.general',
		},

		// ── Revised spec: GSE/SMV full mode deferred (needs parent iedName) ─

		// ── Revised spec: ApplicationSclRef full + ControllingLNode full
		'ApplicationSclRef full → fileUuid/fileType v{version}.{revision}': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:ApplicationSclRef ${id}="asr2">
							<eIEC61850-6-100:SclFileReference fileUuid="uuid-1" fileType="ICD" version="1" revision="A" ${id}="sfr2"/>
						</eIEC61850-6-100:ApplicationSclRef>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'ApplicationSclRef', id: 'asr2' },
			mode: 'full',
			expectedTitle: 'uuid-1/ICD v1.A',
		},
		'ControllingLNode full → resourceName/pLN': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<DataTypeTemplates ${id}="dtt">
						<DOType id="DO1" cdc="ENC" ${id}="do1">
							<eIEC61850-6-100:ControllingLNode resourceName="PTRCCBR" pLN="XCBR" ${id}="ctrl1"/>
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			ref: { tagName: 'ControllingLNode', id: 'ctrl1' },
			mode: 'full',
			expectedTitle: 'PTRCCBR/XCBR',
		},

		// ── Revised spec: ExtRef srcCBName (optional segment) ─────────
		'ExtRef compact with srcCBName → suffix appended': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-ax">
						<AccessPoint name="AP1" ${id}="ap1x">
							<Server ${id}="srv1x">
								<LDevice inst="LD0" ${id}="ld0x">
									<LN0 lnClass="LLN0" inst="" lnType="t0" ${id}="ln0x">
										<Inputs ${id}="inputs1x">
											<ExtRef iedName="IED_B" ldInst="LD1" prefix="P" lnClass="XCBR" lnInst="1" doName="Pos" daName="stVal" srcCBName="gcb01" ${id}="ext-with-cb"/>
										</Inputs>
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'ExtRef', id: 'ext-with-cb' },
			expectedTitle: 'IED_B/LD1/PXCBR1.Pos.stVal/gcb01',
		},

		// ── Revised spec: FunctionRef prefix ──────────────────────────
		'FunctionRef → fn:function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:FunctionRef function="Sub1/F2" functionUuid="u2" ${id}="fr1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'FunctionRef', id: 'fr1' },
			expectedTitle: 'Sub1/F2',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			if (testCase.expectedLabels) {
				const result = await extractElementTitle(source.query, testCase.ref, {
					mode: testCase.mode,
					withLabels: true,
				})
				expect(result.title).toBe(testCase.expectedTitle)
				expect(result.labels).toEqual(testCase.expectedLabels)
				return
			}
			const title = await extractElementTitle(source.query, testCase.ref, {
				mode: testCase.mode,
			})
			expect(title).toBe(testCase.expectedTitle)
		},
	})
})
