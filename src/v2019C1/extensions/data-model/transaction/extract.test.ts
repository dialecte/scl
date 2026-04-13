import { extract } from './extract'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseTestCase & {
	lnodeRef: { tagName: 'LNode'; id: string }
}

describe('extract', () => {
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
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
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
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
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
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expectedQueries: [
				'//default:SCL/default:DataTypeTemplates',
				'//default:DataTypeTemplates/default:LNodeType[@id="MMXU_Type"]',
				'//default:DataTypeTemplates/default:DOType[@id="MV_Type"]',
				'//default:DataTypeTemplates/default:DAType[@id="AnalogValue"]/default:BDA[@name="f"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		const sourceQuery = source.document.query
		const lnodeRecord = await sourceQuery.getRecord(testCase.lnodeRef)
		if (!lnodeRecord) throw new Error('LNode not found')

		await target.document.transaction(async (tx) => {
			await extract(tx, { sourceQuery, records: [lnodeRecord] })
		})

		const lnodeTypes = await target.document.query.getRecordsByTagName('LNodeType')
		expect(lnodeTypes.length, 'no duplicate LNodeTypes').toBe(
			new Set(lnodeTypes.map((r) => r.attributes.find((a) => a.name === 'id')?.value)).size,
		)

		return { assertDatabaseName: target.databaseName }
	}

	runSclTestCases.withExport({ testCases, act })
})
