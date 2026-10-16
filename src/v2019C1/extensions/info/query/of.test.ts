import { of } from './of'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ElementState } from '@/v2019C1'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

describe('of', () => {
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

		// ── text-content ─────────────────────────────────────────────
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
						<AccessPoint name="AP1" ${id}="ap">
							<Server ${id}="srv">
								<LDevice inst="LD0" ${id}="ld">
									<LN0 lnClass="LLN0" inst="" lnType="T1" ${id}="ln0">
										<GSEControl name="gse1" ${id}="gse">
											<IEDName apRef="AP1" ${id}="iedname-1">P1</IEDName>
										</GSEControl>
									</LN0>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'IEDName', id: 'iedname-1' },
			expectedTitle: 'P1',
		},

		// ── mode option ──────────────────────────────────────────────
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

		// ── simple *Ref ────────────────────────────────────────
		'FunctionCatRef → function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="Sub1" ${id}="s1">
						<Function name="F1" uuid="u1" ${id}="f1"/>
						<eIEC61850-6-100:FunctionCatRef function="Sub1/F1" functionUuid="u1" ${id}="fcr1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'FunctionCatRef', id: 'fcr1' },
			expectedTitle: 'Sub1/F1',
		},

		// ── composite ──────────────────────────────────────────
		'MinRequestedSCDFile with version and revision → version.revision': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<MinRequestedSCDFiles ${id}="requested-files">
							<MinRequestedSCDFile fileType="SCD" fileUuid="file-uuid" version="2" revision="A" ${id}="min-requested-scd"/>
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'MinRequestedSCDFile', id: 'min-requested-scd' },
			expectedTitle: '2.A',
		},
		'MinRequestedSCDFile without version → raw revision': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<MinRequestedSCDFiles ${id}="requested-files">
							<MinRequestedSCDFile fileType="SCD" fileUuid="file-uuid" version="" revision="A" ${id}="min-requested-scd"/>
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'MinRequestedSCDFile', id: 'min-requested-scd' },
			expectedTitle: 'A',
		},
		'MinRequestedSCDFile without revision → raw version': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<IED name="IED_A" ${id}="ied-a">
						<MinRequestedSCDFiles ${id}="requested-files">
							<MinRequestedSCDFile fileType="SCD" fileUuid="file-uuid" version="2" revision="" ${id}="min-requested-scd"/>
						</MinRequestedSCDFiles>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'MinRequestedSCDFile', id: 'min-requested-scd' },
			expectedTitle: '2',
		},
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

		// ── LNode family ─────────────────────────────────────────────
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

		// ── data-flow vars ───────────────────────────────────────────
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

		// ── ExtRef compact ───────────────────────────────────────────
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

		// ── FCDA ─────────────────────────────────────────────────────
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

		// ── Labels ────────────────────────────────────────────────
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

		// ── Revised spec: composite refs (conditional compact) ────────
		// ControlRef: prefer concrete `controlled`, fall back to pLN.pDO hint.
		'ControlRef compact (connected) → its output name, the binding left to the state': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:ControlRef output="CMD" outputInst="1" pLN="CSWI" pDO="Pos" controlled="XCBR1" ${id}="cref1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'ControlRef', id: 'cref1' },
			expectedTitle: 'CMD',
		},
		'ControlRef compact (open) → its output name': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:ControlRef output="CMD" outputInst="1" pLN="CSWI" pDO="Pos" ${id}="cref-open"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'ControlRef', id: 'cref-open' },
			expectedTitle: 'CMD',
		},
		'ControlRef full → name/pLN.pDO/controlled': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:ControlRef output="CMD" outputInst="1" pLN="CSWI" pDO="Pos" controlled="XCBR1" ${id}="cref-full"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'ControlRef', id: 'cref-full' },
			mode: 'full',
			expectedTitle: 'CMD/CSWI.Pos/XCBR1',
		},
		// SourceRef: prefer concrete `source`, fall back to pLN.pDO.pDA hint.
		'SourceRef compact (connected) → its input name, no service, the binding left to the state': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:SourceRef service="GOOSE" input="TripIn" inputInst="2" pLN="PTRC" pDO="Trip" pDA="general" source="Trip.general" ${id}="sref1"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'SourceRef', id: 'sref1' },
			expectedTitle: 'TripIn',
		},
		'SourceRef compact (open) → its input name': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:SourceRef service="GOOSE" input="TripIn" inputInst="2" pLN="PTRC" pDO="Trip" pDA="general" ${id}="sref-open"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'SourceRef', id: 'sref-open' },
			expectedTitle: 'TripIn',
		},
		'SourceRef full → name/pLN.pDO.pDA/source, no service': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<eIEC61850-6-100:SourceRef service="GOOSE" input="TripIn" inputInst="2" pLN="PTRC" pDO="Trip" pDA="general" source="Trip.general" ${id}="sref2"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'SourceRef', id: 'sref2' },
			mode: 'full',
			expectedTitle: 'TripIn/PTRC.Trip.general/Trip.general',
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

		// ── lineage is identity, never a title ───────────────────────
		'Header, identified by its uuid alone → the tag, not the uuid': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Header id="doc" uuid="7b7a2b1e-0f4d-4b3a-9a1e-0f4d4b3a9a1e" ${id}="hdr"/>
				</SCL>
			`,
			ref: { tagName: 'Header', id: 'hdr' },
			expectedTitle: 'Header',
		},

		// ── Revised spec: FunctionRef prefix ──────────────────────────
		'FunctionRef → fn:function': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="Sub1" ${id}="s1">
						<Function name="F2" uuid="u2" ${id}="f2"/>
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
			const result = await of(source.query, testCase.ref, {
				mode: testCase.mode,
				withLabels: Boolean(testCase.expectedLabels),
			})
			expect(result.title).toBe(testCase.expectedTitle)
			if (testCase.expectedLabels) expect(result.labels).toEqual(testCase.expectedLabels)
		},
	})
})

/**
 * The state of an element, next to its title: a SourceRef / ControlRef is open or connected and
 * implemented or not; an LNode is locked once an IED is assigned to it. A SourceRef / ControlRef
 * is titled by its name among the signals of its LNode.
 */
describe('of — state and signal title', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expected: { title: string; state?: ElementState }
		mode?: 'compact' | 'full'
	}

	function lnodeWith(children: string, lnodeAttributes = 'iedName="None"'): string {
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<Function name="F1" ${id}="f1">
						<LNode lnClass="PTRC" lnInst="1" ${lnodeAttributes} ${id}="lnode">
							${children}
						</LNode>
					</Function>
				</Substation>
			</SCL>
		`
	}

	const sourceRef = { tagName: 'SourceRef', id: 'sr' } as const

	const testCases: SclTest.TestCases<TestCase> = {
		'SourceRef without source → open, not implemented, titled by its input': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:LNodeInputs ${id}="in"><eIEC61850-6-100:SourceRef input="Trip" ${id}="sr"/></eIEC61850-6-100:LNodeInputs>`,
			),
			ref: sourceRef,
			expected: { title: 'Trip', state: { binding: 'open', implemented: false } },
		},
		'SourceRef with a source path → connected': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:LNodeInputs ${id}="in"><eIEC61850-6-100:SourceRef input="Trip" source="S1/F1/XCBR1.Pos.stVal" ${id}="sr"/></eIEC61850-6-100:LNodeInputs>`,
			),
			ref: sourceRef,
			expected: { title: 'Trip', state: { binding: 'connected', implemented: false } },
		},
		'SourceRef with sourceLNodeUuid only → connected': {
			allowIncoherentReferences:
				'the uuid names an element of another file: the state reads its presence only',
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:LNodeInputs ${id}="in"><eIEC61850-6-100:SourceRef input="Trip" sourceLNodeUuid="uuid-elsewhere" sourceDoName="Pos" ${id}="sr"/></eIEC61850-6-100:LNodeInputs>`,
			),
			ref: sourceRef,
			expected: { title: 'Trip', state: { binding: 'connected', implemented: false } },
		},
		'SourceRef with an extRefAddr and no source → open and implemented': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:LNodeInputs ${id}="in"><eIEC61850-6-100:SourceRef input="Trip" extRefAddr="LD0/PTRC1.Op" ${id}="sr"/></eIEC61850-6-100:LNodeInputs>`,
			),
			ref: sourceRef,
			expected: { title: 'Trip', state: { binding: 'open', implemented: true } },
		},
		'two SourceRefs share the input → titled "Trip(1).general"': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:LNodeInputs ${id}="in"><eIEC61850-6-100:SourceRef input="Trip" pDA="general" ${id}="sr"/><eIEC61850-6-100:SourceRef input="Trip" pDA="q" ${id}="sr-q"/></eIEC61850-6-100:LNodeInputs>`,
			),
			ref: sourceRef,
			expected: { title: 'Trip(1).general', state: { binding: 'open', implemented: false } },
		},
		'SourceRef in full mode → name, hint and source': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:LNodeInputs ${id}="in"><eIEC61850-6-100:SourceRef input="Trip" pLN="XCBR" pDO="Pos" pDA="stVal" source="S1/F1/XCBR1.Pos.stVal" ${id}="sr"/></eIEC61850-6-100:LNodeInputs>`,
			),
			ref: sourceRef,
			mode: 'full',
			expected: {
				title: 'Trip/XCBR.Pos.stVal/S1/F1/XCBR1.Pos.stVal',
				state: { binding: 'connected', implemented: false },
			},
		},
		'ControlRef with controlled data and extCtrlUuid → connected and implemented': {
			allowIncoherentReferences:
				'the uuid names an element of another file: the state reads its presence only',
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:LNodeOutputs ${id}="out"><eIEC61850-6-100:ControlRef output="Oper" controlled="S1/F1/XCBR1.Pos" extCtrlUuid="uuid-ctrl" ${id}="cr"/></eIEC61850-6-100:LNodeOutputs>`,
			),
			ref: { tagName: 'ControlRef', id: 'cr' },
			expected: { title: 'Oper', state: { binding: 'connected', implemented: true } },
		},
		'LNode bound by lnUuid to an LN of an IED with an ICD source file → locked, mapped to a real IED':
			{
				sourceXml: /* xml */ `
					<SCL ${ns} ${id}="root">
						<Substation name="S1" ${id}="s1">
							<Function name="F1" ${id}="f1">
								<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" lnUuid="uuid-ln" ${id}="lnode"/>
							</Function>
						</Substation>
						<IED name="IED1" ${id}="ied1">
							<IEDSourceFiles ${id}="isf">
								<SclFileReference fileType="ICD" ${id}="sfr"/>
							</IEDSourceFiles>
							<AccessPoint name="AP1" ${id}="ap">
								<Server ${id}="srv">
									<Authentication ${id}="auth"/>
									<LDevice inst="LD0" ${id}="ld0">
										<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
										<LN lnClass="PTRC" inst="1" lnType="T1" uuid="uuid-ln" ${id}="ln"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					</SCL>
				`,
				ref: { tagName: 'LNode', id: 'lnode' },
				expected: { title: 'PTRC1', state: { locked: true, mapping: 'real-ied' } },
			},
		'LNode bound to an LN of an IED without source files → locked, mapped to a specification IED': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" lnUuid="uuid-ln" ${id}="lnode"/>
						</Function>
					</Substation>
					<IED name="IED1" ${id}="ied1">
						<AccessPoint name="AP1" ${id}="ap">
							<Server ${id}="srv">
								<Authentication ${id}="auth"/>
								<LDevice inst="LD0" ${id}="ld0">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
									<LN lnClass="PTRC" inst="1" lnType="T1" uuid="uuid-ln" ${id}="ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode' },
			expected: { title: 'PTRC1', state: { locked: true, mapping: 'specification-ied' } },
		},
		'LNode whose lnUuid names no LN of the document → locked, unmapped, its names are not tried': {
			allowIncoherentReferences: 'a binding to an LN the document lacks is what is under test',
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" lnUuid="uuid-gone" ${id}="lnode"/>
						</Function>
					</Substation>
					<IED name="IED1" ${id}="ied1">
						<IEDSourceFiles ${id}="isf">
							<SclFileReference fileType="ICD" ${id}="sfr"/>
						</IEDSourceFiles>
						<AccessPoint name="AP1" ${id}="ap">
							<Server ${id}="srv">
								<Authentication ${id}="auth"/>
								<LDevice inst="LD0" ${id}="ld0">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
									<LN lnClass="PTRC" inst="1" lnType="T1" uuid="uuid-ln" ${id}="ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode' },
			expected: { title: 'PTRC1', state: { locked: true, mapping: 'unmapped' } },
		},
		'LNode without lnUuid, its names naming an LN of a real IED → mapped to a real IED': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation name="S1" ${id}="s1">
						<Function name="F1" ${id}="f1">
							<LNode lnClass="PTRC" lnInst="1" iedName="IED1" ldInst="LD0" ${id}="lnode"/>
						</Function>
					</Substation>
					<IED name="IED1" ${id}="ied1">
						<IEDSourceFiles ${id}="isf">
							<SclFileReference fileType="ICD" ${id}="sfr"/>
						</IEDSourceFiles>
						<AccessPoint name="AP1" ${id}="ap">
							<Server ${id}="srv">
								<Authentication ${id}="auth"/>
								<LDevice inst="LD0" ${id}="ld0">
									<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0"/>
									<LN lnClass="PTRC" inst="1" lnType="T1" uuid="uuid-ln" ${id}="ln"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			ref: { tagName: 'LNode', id: 'lnode' },
			expected: { title: 'PTRC1', state: { locked: true, mapping: 'real-ied' } },
		},
		'LNode assigned to an IED → locked': {
			sourceXml: lnodeWith('', 'iedName="IED1" ldInst="LD0"'),
			ref: { tagName: 'LNode', id: 'lnode' },
			expected: { title: 'PTRC1', state: { locked: true, mapping: 'unmapped' } },
		},
		'LNode with iedName None → not locked': {
			sourceXml: lnodeWith(''),
			ref: { tagName: 'LNode', id: 'lnode' },
			expected: { title: 'PTRC1', state: { locked: false, mapping: 'unmapped' } },
		},
		'Function → no state': {
			sourceXml: lnodeWith(''),
			ref: { tagName: 'Function', id: 'f1' },
			expected: { title: 'F1', state: undefined },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await of(source.query, testCase.ref, { mode: testCase.mode })
			expect({ title: result.title, state: result.state }).toEqual({
				title: testCase.expected.title,
				state: testCase.expected.state,
			})
		},
	})
})

/**
 * An ExtRef or an ExtCtrl reads, from how completely it is written: nothing, only where it lands
 * in the IED (`later-binding`), the signal it names (`expected`), that signal together with its
 * service and the control block publishing it, unless the service needs none (`subscribed`, an
 * ExtRef only), then also where it lands (`bound`).
 */
describe('of — ExtRef and ExtCtrl state', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expected: ElementState
	}

	function ldeviceWith(params: { inputs?: string; outputs?: string }): string {
		const { inputs = '', outputs = '' } = params
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<IED name="B1" ${id}="ied">
					<AccessPoint name="AP1" ${id}="ap">
						<Server ${id}="server">
							<Authentication ${id}="authentication"/>
							<LDevice inst="LD0" ${id}="ld0">
								<LN0 lnClass="LLN0" inst="" lnType="T0" ${id}="ln0">
									<GSEControl name="GCB1" appID="app1" ${id}="gse-control"/>
								</LN0>
								<LN lnClass="XCBR" inst="1" lnType="T1" uuid="uuid-xcbr" ${id}="xcbr">
									${inputs}
									${outputs}
								</LN>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
			</SCL>
		`
	}

	function withExtRef(attributes: string): string {
		return ldeviceWith({
			inputs: `<Inputs ${id}="inputs"><ExtRef ${attributes} ${id}="ext-ref"/></Inputs>`,
		})
	}

	function withExtCtrl(attributes: string): string {
		return ldeviceWith({
			outputs: `<Outputs ${id}="outputs"><ExtCtrl ${attributes} ${id}="ext-ctrl"/></Outputs>`,
		})
	}

	const extRef = { tagName: 'ExtRef', id: 'ext-ref' } as const
	const extCtrl = { tagName: 'ExtCtrl', id: 'ext-ctrl' } as const
	const signal = 'iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" doName="Pos"'

	const testCases: SclTest.TestCases<TestCase> = {
		'ExtRef naming a signal and a srcCBName without serviceType → expected': {
			sourceXml: withExtRef(`${signal} srcCBName="GCB1"`),
			ref: extRef,
			expected: 'expected',
		},
		'ExtRef naming its logical node by lnUuid with a doName and a GOOSE control block → subscribed':
			{
				sourceXml: withExtRef(
					'lnUuid="uuid-xcbr" doName="Pos" srcCBName="GCB1" serviceType="GOOSE"',
				),
				ref: extRef,
				expected: 'subscribed',
			},
		'ExtRef with no attribute → empty': {
			sourceXml: withExtRef(''),
			ref: extRef,
			expected: 'empty',
		},
		'ExtRef with an intAddr only → later-binding': {
			sourceXml: withExtRef('intAddr="Pos"'),
			ref: extRef,
			expected: 'later-binding',
		},
		'ExtRef naming a signal, no control block, no intAddr → expected': {
			sourceXml: withExtRef(`${signal}`),
			ref: extRef,
			expected: 'expected',
		},
		'ExtRef naming a signal and a GOOSE control block → subscribed': {
			sourceXml: withExtRef(`${signal} srcCBName="GCB1" serviceType="GOOSE"`),
			ref: extRef,
			expected: 'subscribed',
		},
		'ExtRef naming a signal, a GOOSE control block and an intAddr → bound': {
			sourceXml: withExtRef(
				`${signal} intAddr="Pos" srcLDInst="LD0" srcCBName="GCB1" serviceType="GOOSE"`,
			),
			ref: extRef,
			expected: 'bound',
		},
		'ExtRef naming a signal of a service without control block → subscribed': {
			sourceXml: withExtRef(`${signal} serviceType="Poll"`),
			ref: extRef,
			expected: 'subscribed',
		},
		'ExtRef naming a signal, a srcCBUuid and a GOOSE service → subscribed': {
			allowIncoherentReferences:
				'the uuid names a control block of another file: the state reads its presence only',
			sourceXml: withExtRef(`${signal} srcCBUuid="uuid-elsewhere" serviceType="GOOSE"`),
			ref: extRef,
			expected: 'subscribed',
		},
		'ExtRef naming a signal and an intAddr, GOOSE without control block → expected': {
			sourceXml: withExtRef(`${signal} intAddr="Pos" serviceType="GOOSE"`),
			ref: extRef,
			expected: 'expected',
		},
		'ExtRef naming a signal and an intAddr, no service, no control block → expected': {
			sourceXml: withExtRef(`${signal} intAddr="Pos"`),
			ref: extRef,
			expected: 'expected',
		},
		'ExtRef naming a doName and part of its logical node (no iedName) and an intAddr → later-binding':
			{
				sourceXml: withExtRef('ldInst="LD0" lnClass="PTRC" lnInst="1" doName="Pos" intAddr="Pos"'),
				ref: extRef,
				expected: 'later-binding',
			},
		'ExtRef naming part of a signal (no doName) and an intAddr → later-binding': {
			sourceXml: withExtRef('iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1" intAddr="Pos"'),
			ref: extRef,
			expected: 'later-binding',
		},
		'ExtRef naming an LLN0 signal without lnInst, with a GOOSE control block → subscribed': {
			sourceXml: withExtRef(
				'iedName="B1" ldInst="LD0" lnClass="LLN0" doName="Mod" srcCBName="GCB1" serviceType="GOOSE"',
			),
			ref: extRef,
			expected: 'subscribed',
		},
		'ExtCtrl with no attribute → empty': {
			sourceXml: withExtCtrl(''),
			ref: extCtrl,
			expected: 'empty',
		},
		'ExtCtrl with an intAddr only → later-binding': {
			sourceXml: withExtCtrl('intAddr="Pos"'),
			ref: extCtrl,
			expected: 'later-binding',
		},
		'ExtCtrl naming part of a signal (no doName) → empty': {
			sourceXml: withExtCtrl('iedName="B1" ldInst="LD0" lnClass="XCBR" lnInst="1"'),
			ref: extCtrl,
			expected: 'empty',
		},
		'ExtCtrl naming its logical node by lnUuid with a doName → expected': {
			sourceXml: withExtCtrl('lnUuid="uuid-xcbr" doName="Pos"'),
			ref: extCtrl,
			expected: 'expected',
		},
		'ExtCtrl naming a signal, no intAddr → expected': {
			sourceXml: withExtCtrl(`${signal}`),
			ref: extCtrl,
			expected: 'expected',
		},
		'ExtCtrl naming a signal and an intAddr → bound': {
			sourceXml: withExtCtrl(`${signal} intAddr="Pos"`),
			ref: extCtrl,
			expected: 'bound',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await of(source.query, testCase.ref)
			expect(result.state).toEqual(testCase.expected)
		},
	})
})
