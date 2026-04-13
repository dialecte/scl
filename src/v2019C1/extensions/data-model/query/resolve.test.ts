import { resolve } from './resolve'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseTestCase & {
	lnodeRef: { tagName: 'LNode'; id: string }
	expected: {
		lnodeTypes: string[]
		doTypes: string[]
		daTypes: string[]
		enumTypes: string[]
	}
}

describe('resolveDataModel', () => {
	const DTT = `${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-1"`

	const testCases: SclTest.TestCases<TestCase> = {
		'single LNode → resolves LNodeType, DOType, DAType, EnumType': {
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
						<DA name="q" bType="Quality" fc="ST" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-2"/>
					</DOType>
					<EnumType id="BehaviourModeKind" ${CUSTOM_RECORD_ID_ATTRIBUTE}="et-1">
						<EnumVal ord="1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ev-1">on</EnumVal>
						<EnumVal ord="2" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ev-2">blocked</EnumVal>
					</EnumType>
				</DataTypeTemplates>
			</SCL>`,
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: {
				lnodeTypes: ['CSWI_Type'],
				doTypes: ['DPC_Type'],
				daTypes: [],
				enumTypes: ['BehaviourModeKind'],
			},
		},

		'two LNodes referencing same LNodeType → deduped': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
							<LNode iedName="None" lnClass="CSWI" lnInst="2" lnType="CSWI_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-2"/>
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
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: {
				lnodeTypes: ['CSWI_Type'],
				doTypes: ['DPC_Type'],
				daTypes: [],
				enumTypes: [],
			},
		},

		'DA with bType=Struct → resolves DAType recursively': {
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
						<DO name="PhV" type="WYE_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-1"/>
					</LNodeType>
					<DOType id="WYE_Type" cdc="WYE" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-1">
						<DA name="phsA" bType="Struct" type="CMV_Type" fc="MX" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-1"/>
					</DOType>
					<DAType id="CMV_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dat-1">
						<BDA name="cVal" bType="Struct" type="Vector_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bda-1"/>
					</DAType>
					<DAType id="Vector_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dat-2">
						<BDA name="mag" bType="FLOAT32" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bda-2"/>
					</DAType>
				</DataTypeTemplates>
			</SCL>`,
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: {
				lnodeTypes: ['MMXU_Type'],
				doTypes: ['WYE_Type'],
				daTypes: ['CMV_Type', 'Vector_Type'],
				enumTypes: [],
			},
		},

		'DOType with SDO → resolves referenced DOType': {
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
						<DO name="PhV" type="WYE_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-1"/>
					</LNodeType>
					<DOType id="WYE_Type" cdc="WYE" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-1">
						<SDO name="phsA" type="CMV_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sdo-1"/>
					</DOType>
					<DOType id="CMV_Type" cdc="CMV" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-2">
						<DA name="mag" bType="FLOAT32" fc="MX" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-1"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: {
				lnodeTypes: ['MMXU_Type'],
				doTypes: ['WYE_Type', 'CMV_Type'],
				daTypes: [],
				enumTypes: [],
			},
		},

		'DOType with chained SDOs → resolves all DOTypes in the chain': {
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
						<DO name="PhV" type="WYE_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-1"/>
					</LNodeType>
					<DOType id="WYE_Type" cdc="WYE" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-1">
						<SDO name="phsA" type="VEC_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sdo-1"/>
					</DOType>
					<DOType id="VEC_Type" cdc="VEC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-2">
						<SDO name="mag" type="CMV_Type" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sdo-2"/>
					</DOType>
					<DOType id="CMV_Type" cdc="CMV" ${CUSTOM_RECORD_ID_ATTRIBUTE}="dot-3">
						<DA name="instMag" bType="FLOAT32" fc="MX" ${CUSTOM_RECORD_ID_ATTRIBUTE}="da-1"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>`,
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: {
				lnodeTypes: ['MMXU_Type'],
				doTypes: ['WYE_Type', 'VEC_Type', 'CMV_Type'],
				daTypes: [],
				enumTypes: [],
			},
		},

		'LNode with missing lnType → skipped, empty result': {
			sourceXml: `
			<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">
				<Substation name="S1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="sub-1">
					<VoltageLevel name="V1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="vl-1">
						<Bay name="B1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="bay-1">
							<LNode iedName="None" lnClass="CSWI" lnInst="1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnode-1"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${DTT}/>
			</SCL>`,
			lnodeRef: { tagName: 'LNode', id: 'lnode-1' },
			expected: {
				lnodeTypes: [],
				doTypes: [],
				daTypes: [],
				enumTypes: [],
			},
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const query = source.document.query

		const lnodeRecord = await query.getRecord(testCase.lnodeRef)
		if (!lnodeRecord) throw new Error('LNode not found')

		const result = await resolve(query, { records: [lnodeRecord] })

		const toIds = (records: { attributes: { name: string; value: string }[] }[]) =>
			records.map((r) => r.attributes.find((a) => a.name === 'id')?.value ?? '')

		expect(toIds(result.lnodeTypes)).toEqual(testCase.expected.lnodeTypes)
		expect(toIds(result.doTypes)).toEqual(testCase.expected.doTypes)
		expect(toIds(result.daTypes)).toEqual(testCase.expected.daTypes)
		expect(toIds(result.enumTypes)).toEqual(testCase.expected.enumTypes)

		return { assertDatabaseName: source.databaseName }
	}

	runSclTestCases.withExport({ testCases, act })
})
