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
	cloneTargets: Scl.Ref<Scl.ElementsOf>[]
	expectedStats: Partial<ImportTypesStats>
}

describe('importTypes - a clone bound to an IED of the project', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a cloned LNode bound to an IED → lnType repointed like any clone': {
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
				<IED name="VENDOR_A" manufacturer="SIEMENS" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ied-t">
					<AccessPoint name="AP1" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ap-t">
						<Server ${CUSTOM_RECORD_ID_ATTRIBUTE}="srv-t">
							<Authentication ${CUSTOM_RECORD_ID_ATTRIBUTE}="auth-t"/>
							<LDevice inst="LD0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ld-t">
								<LN0 lnClass="LLN0" inst="" lnType="PRJ_LLN0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln0-t"/>
								<LN lnClass="CSWI" inst="1" lnType="PRJ_CSWI" ${CUSTOM_RECORD_ID_ATTRIBUTE}="ln-t"/>
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${CUSTOM_RECORD_ID_ATTRIBUTE}="dtt-t">
					<LNodeType id="PRJ_LLN0" lnClass="LLN0" ${CUSTOM_RECORD_ID_ATTRIBUTE}="lnt-lln0-t">
						<DO name="Mod" type="PRJ_DPC" ${CUSTOM_RECORD_ID_ATTRIBUTE}="do-lln0-t"/>
					</LNodeType>
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
				// a clone is never an implementation of the project: it takes the type its template names
				'//default:LNode[@iedName="VENDOR_A"][@lnType="PRJ_CSWI"]',
			],
			unexpectedQueries: ['//default:LNode[@lnType="SRC_CSWI"]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lnodeRecord = await source.query.getRecord(testCase.sourceRef)
		if (!lnodeRecord) throw new Error('LNode not found')

		let stats: ImportTypesStats | undefined
		await target.transaction(async function importTheTypes(tx) {
			const result = await importTypes(tx, {
				sourceQuery: source.query,
				records: [lnodeRecord],
				cloneMappings: testCase.cloneTargets.map((clone) => ({
					source: { ...clone, attributes: [] },
					target: clone,
				})),
				forkPrefix: 'PRJ_',
			})
			stats = result.stats
		})
		expect(stats).toMatchObject(testCase.expectedStats)

		const lnodeTypes = await target.query.getRecordsByTagName('LNodeType')
		expect(lnodeTypes.length, 'no duplicate LNodeTypes').toBe(
			new Set(
				lnodeTypes.map(
					(type) => type.attributes.find((attribute) => attribute.name === 'id')?.value,
				),
			).size,
		)
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
