import { importTypes } from './import-types'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { ImportTypesStats } from './import-types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	sourceRef: { tagName: 'LNode'; id: string }
	cloneTargets?: Scl.Ref<Scl.ElementsOf>[]
	/** Passed through to `importTypes`; on dedup, which side's type id/name survives. */
	keepNameTypesFrom?: 'source' | 'target'
	/** Asserted against the returned `stats` when present. */
	expectedStats?: Partial<ImportTypesStats>
}

describe('importTypes', () => {
	const DTT = `${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-1"`
	const EMPTY_TARGET = `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t"></SCL>`

	const testCases: SclTest.TestCases<TestCase> = {
		'single LNode → LNodeType, DOType, EnumType cloned into target DTT': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${DTT}>
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-1">
						<DO name="Pos" type="DPC_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-1"/>
					</LNodeType>
					<DOType id="DPC_Type" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-1">
						<DA name="stVal" bType="Enum" type="BehaviourModeKind" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-1"/>
					</DOType>
					<EnumType id="BehaviourModeKind" ${CUSTOM_RECORD_ID_ATTRIBUTE}="et-1">
						<EnumVal ord="1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ev-1">on</EnumVal>
					</EnumType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: EMPTY_TARGET,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC_Type"]/default:DA[@name="stVal"]',
				'//default:DataTypeTemplates/default:EnumType[@id="BehaviourModeKind"]/default:EnumVal[@ord="1"]',
			],
		},

		'target already has matching LNodeType → not duplicated': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${DTT}>
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-1">
						<DO name="Pos" type="DPC_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-1"/>
					</LNodeType>
					<DOType id="DPC_Type" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-1">
						<DA name="q" bType="Quality" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-1"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t"/>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_Type"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC_Type"]',
			],
		},

		'target has no DataTypeTemplates → DTT element created': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="MMXU" lnInst="1" lnType="MMXU_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${DTT}>
					<LNodeType id="MMXU_Type" lnClass="MMXU" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-1">
						<DO name="TotW" type="MV_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-1"/>
					</LNodeType>
					<DOType id="MV_Type" cdc="MV" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-1">
						<DA name="mag" bType="Struct" type="AnalogValue" fc="MX" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-1"/>
					</DOType>
					<DAType id="AnalogValue" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dat-1">
						<BDA name="f" bType="FLOAT32" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bda-1"/>
					</DAType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: EMPTY_TARGET,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			expectedQueries: [
				'//default:SCL/default:DataTypeTemplates',
				'//default:DataTypeTemplates/default:LNodeType[@id="MMXU_Type"]',
				'//default:DataTypeTemplates/default:DOType[@id="MV_Type"]',
				'//default:DataTypeTemplates/default:DAType[@id="AnalogValue"]/default:BDA[@name="f"]',
			],
		},

		'target has a structurally-equal type under a different id → reused, bound LN repointed': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SRC_CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="SRC_CSWI" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Pos" type="SRC_DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="SRC_DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<IED name="T1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<!-- instance was cloned carrying the source type id, awaiting reconcile: -->
								<LN lnClass="CSWI" inst="1" lnType="SRC_CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="PRJ_CSWI" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="PRJ_DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<DOType id="PRJ_DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			cloneTargets: [{ tagName: 'LN', id: 'ln-t' }],
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="PRJ_CSWI"]',
				'//default:LN[@lnType="PRJ_CSWI"]',
			],
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="SRC_CSWI"]',
				'//default:LN[@lnType="SRC_CSWI"]',
			],
		},

		'reclaim: single-consumer update forks then reclaims the original ids down the chain': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Pos" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<IED name="T1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<LN lnClass="CSWI" inst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="INT32" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			cloneTargets: [{ tagName: 'LN', id: 'ln-t' }],
			expectedStats: { forked: 2, reclaimed: 2, reused: 0, preserved: 0 },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="SHARED"]/default:DO[@type="DPC"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC"]/default:DA[@bType="BOOLEAN"]',
				'//default:LN[@lnType="SHARED"]',
			],
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:DOType[@id="DPC"]/default:DA[@bType="INT32"]',
				'//default:DataTypeTemplates/default:LNodeType[starts-with(@id, "PRJ_")]',
				'//default:DataTypeTemplates/default:DOType[starts-with(@id, "PRJ_")]',
			],
		},

		'reclaim: a shared child whose content changed stays forked (only the top id reclaimed)': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Pos" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<IED name="T1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<LN lnClass="CSWI" inst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<LNodeType id="OTHER" lnClass="MMXU" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-o">
						<DO name="Health" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-o"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="INT32" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			cloneTargets: [{ tagName: 'LN', id: 'ln-t' }],
			expectedStats: { forked: 2, reclaimed: 1 },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="SHARED"]/default:DO[starts-with(@type, "PRJ_DPC_")]',
				'//default:DataTypeTemplates/default:DOType[starts-with(@id, "PRJ_DPC_")]/default:DA[@bType="BOOLEAN"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC"]/default:DA[@bType="INT32"]',
				'//default:DataTypeTemplates/default:LNodeType[@id="OTHER"]/default:DO[@type="DPC"]',
				'//default:LN[@lnType="SHARED"]',
			],
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[starts-with(@id, "PRJ_")]',
			],
		},

		'reclaim: a shared child that did not change is reused, the changed parent is reclaimed': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Mod" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<IED name="T1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<LN lnClass="CSWI" inst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			cloneTargets: [{ tagName: 'LN', id: 'ln-t' }],
			expectedStats: { reused: 1, forked: 1, reclaimed: 1, preserved: 0 },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="SHARED"]/default:DO[@name="Mod"][@type="DPC"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC"]/default:DA[@bType="BOOLEAN"]',
				'//default:LN[@lnType="SHARED"]',
			],
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[starts-with(@id, "PRJ_")]',
			],
		},

		'reclaim: a still-shared top type is not reclaimed (fork stands under its hashed id)': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Pos" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<IED name="T1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<LN lnClass="CSWI" inst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
								<LN lnClass="CSWI" inst="2" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-keep"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<DOType id="DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="INT32" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			cloneTargets: [{ tagName: 'LN', id: 'ln-t' }],
			expectedStats: { forked: 2, reclaimed: 0 },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="SHARED"]',
				'//default:DataTypeTemplates/default:LNodeType[starts-with(@id, "PRJ_SHARED_")]',
				'//default:LN[@inst="2"][@lnType="SHARED"]',
				'//default:LN[@inst="1"][starts-with(@lnType, "PRJ_SHARED_")]',
			],
		},

		'reclaim: an orphaned non-colliding child of a pruned chain is swept (no id to reclaim)': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Pos" type="SRC_DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="SRC_DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<IED name="T1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<LN lnClass="CSWI" inst="1" lnType="SHARED" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="SHARED" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="OLD_DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<DOType id="OLD_DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="INT32" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			cloneTargets: [{ tagName: 'LN', id: 'ln-t' }],
			expectedStats: { forked: 1, preserved: 1, reclaimed: 1 },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="SHARED"]/default:DO[@type="SRC_DPC"]',
				'//default:DataTypeTemplates/default:DOType[@id="SRC_DPC"]/default:DA[@bType="BOOLEAN"]',
				'//default:LN[@lnType="SHARED"]',
			],
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:DOType[@id="OLD_DPC"]',
				'//default:DataTypeTemplates/default:LNodeType[starts-with(@id, "PRJ_")]',
			],
		},

		'keepNameTypesFrom source → reused types adopt incoming ids and existing referrers follow': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_ICD" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="CSWI_ICD" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Pos" type="DPC_ICD" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="DPC_ICD" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<IED name="T1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<LN lnClass="CSWI" inst="1" lnType="CSWI_SSD" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="CSWI_SSD" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="DPC_SSD" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<DOType id="DPC_SSD" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			keepNameTypesFrom: 'source',
			expectedStats: { reused: 2 },
			expectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_ICD"]/default:DO[@type="DPC_ICD"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC_ICD"]/default:DA[@bType="BOOLEAN"]',
				'//default:LN[@lnType="CSWI_ICD"]',
			],
			unexpectedQueries: [
				'//default:DataTypeTemplates/default:LNodeType[@id="CSWI_SSD"]',
				'//default:DataTypeTemplates/default:DOType[@id="DPC_SSD"]',
				'//default:LN[@lnType="CSWI_SSD"]',
			],
		},

		'locked LNode clone target → lnType NOT repointed (protected)': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="SRC_CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-s">
					<LNodeType id="SRC_CSWI" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-s">
						<DO name="Pos" type="SRC_DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-s"/>
					</LNodeType>
					<DOType id="SRC_DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-s">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-s"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			targetXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-t">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-t">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-t">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-t">
							<LNode iedName="VENDOR_A" ldInst="LD0" lnClass="CSWI" lnInst="1" lnType="SRC_CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="locked-lnode"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<IED name="VENDOR_A" manufacturer="SIEMENS" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t"/>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="PRJ_CSWI" lnClass="CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-t">
						<DO name="Pos" type="PRJ_DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-t"/>
					</LNodeType>
					<DOType id="PRJ_DPC" cdc="DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-t">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			sourceRef: { tagName: 'LNode', id: 'lnode-1' },
			cloneTargets: [{ tagName: 'LNode', id: 'locked-lnode' }],
			expectedStats: { reused: 2 },
			expectedQueries: [
				// the locked LNode keeps its original lnType — the fork/dedup remap is skipped
				'//default:LNode[@iedName="VENDOR_A"][@lnType="SRC_CSWI"]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="VENDOR_A"][@lnType="PRJ_CSWI"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		const sourceQuery = source.query
		const lnodeRecord = await sourceQuery.getRecord(testCase.sourceRef)
		if (!lnodeRecord) throw new Error('LNode not found')

		let stats: ImportTypesStats | undefined
		await target.transaction(async (tx) => {
			const result = await importTypes(tx, {
				sourceQuery,
				records: [lnodeRecord],
				cloneMappings: testCase.cloneTargets?.map((target) => ({
					source: { ...target, attributes: [] },
					target,
				})),
				forkPrefix: 'PRJ_',
				keepNameTypesFrom: testCase.keepNameTypesFrom,
			})
			stats = result.stats
		})

		if (testCase.expectedStats) expect(stats).toMatchObject(testCase.expectedStats)

		const lnodeTypes = await target.query.getRecordsByTagName('LNodeType')
		expect(lnodeTypes.length, 'no duplicate LNodeTypes').toBe(
			new Set(lnodeTypes.map((r) => r.attributes.find((a) => a.name === 'id')?.value)).size,
		)

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
