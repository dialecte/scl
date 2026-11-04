import { applyTypeIdRemap } from './apply-type-id-remap'

import { describe, expect } from 'vitest'

import { readAttribute } from '@/v2019C1/helpers'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	records: Scl.Ref<Scl.ElementsOf>[]
	idRemap: [string, string][]
}

describe('applyTypeIdRemap', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	const testCases: SclTest.TestCases<TestCase> = {
		'referrers whose type id is remapped → repointed to the new id': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" lnType="OLD_LLN0" ${ID}="ln0-1"/>
									<LN lnClass="XCBR" inst="1" prefix="" lnType="OLD_XCBR" ${ID}="ln-1"/>
									<LN lnClass="XCBR" inst="2" prefix="" lnType="OLD_XCBR" ${ID}="ln-2"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<DataTypeTemplates ${ID}="dtt-1">
						<LNodeType id="OLD_LLN0" lnClass="LLN0" ${ID}="lnt-0">
							<DO name="Mod" type="MODE_ENC" ${ID}="do-0"/>
						</LNodeType>
						<LNodeType id="OLD_XCBR" lnClass="XCBR" ${ID}="lnt-1">
							<DO name="Pos" type="OLD_DPC" ${ID}="do-1"/>
						</LNodeType>
						<DOType id="OLD_DPC" cdc="DPC" ${ID}="dot-1">
							<DA name="stVal" bType="Dbpos" fc="ST" ${ID}="da-1"/>
						</DOType>
						<DOType id="MODE_ENC" cdc="ENC" ${ID}="dot-mode">
							<DA name="stVal" bType="BOOLEAN" fc="ST" ${ID}="da-mode"/>
						</DOType>
						<!-- the types the ids are remapped to, as the caller creates them -->
						<LNodeType id="NEW_LLN0" lnClass="LLN0" ${ID}="lnt-new-0">
							<DO name="Mod" type="MODE_ENC" ${ID}="do-new-0"/>
						</LNodeType>
						<LNodeType id="NEW_XCBR" lnClass="XCBR" ${ID}="lnt-new-1">
							<DO name="Pos" type="NEW_DPC" ${ID}="do-new-1"/>
						</LNodeType>
						<DOType id="NEW_DPC" cdc="DPC" ${ID}="dot-new-1">
							<DA name="stVal" bType="Dbpos" fc="ST" ${ID}="da-new-1"/>
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
			records: [
				{ tagName: 'LN0', id: 'ln0-1' },
				{ tagName: 'LN', id: 'ln-1' },
				{ tagName: 'DO', id: 'do-1' },
			],
			idRemap: [
				['OLD_LLN0', 'NEW_LLN0'],
				['OLD_XCBR', 'NEW_XCBR'],
				['OLD_DPC', 'NEW_DPC'],
			],
			expectedQueries: [
				'//default:LN0[@lnType="NEW_LLN0"]',
				'//default:LN[@lnType="NEW_XCBR"]',
				'//default:LNodeType[@id="OLD_XCBR"]/default:DO[@type="NEW_DPC"]',
			],
			unexpectedQueries: [
				'//default:LN0[@lnType="OLD_LLN0"]',
				'//default:LN[@inst="1"][@lnType="OLD_XCBR"]',
				'//default:DO[@type="OLD_DPC"]',
			],
		},

		'referrer value absent from the remap → left untouched': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" lnType="OLD_LLN0" ${ID}="ln0-1"/>
									<LN lnClass="XCBR" inst="1" prefix="" lnType="OLD_XCBR" ${ID}="ln-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			records: [
				{ tagName: 'LN0', id: 'ln0-1' },
				{ tagName: 'LN', id: 'ln-1' },
			],
			idRemap: [['OLD_XCBR', 'NEW_XCBR']],
			expectedQueries: ['//default:LN[@lnType="NEW_XCBR"]', '//default:LN0[@lnType="OLD_LLN0"]'],
			unexpectedQueries: ['//default:LN0[@lnType="NEW_LLN0"]'],
		},

		'record whose tag carries no type-id reference → ignored': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN lnClass="XCBR" inst="1" prefix="" lnType="OLD_XCBR" ${ID}="ln-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			records: [{ tagName: 'LDevice', id: 'ld-1' }],
			idRemap: [['OLD_XCBR', 'NEW_XCBR']],
			expectedQueries: ['//default:LN[@lnType="OLD_XCBR"]'],
			unexpectedQueries: ['//default:LN[@lnType="NEW_XCBR"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await applyTypeIdRemap(tx, {
				records: testCase.records,
				idRemap: new Map(testCase.idRemap),
			})
		})

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// The types the referrers leave are not named any more: they go at the commit, with what only they name.
describe('applyTypeIdRemap: the types a remap leaves unused', () => {
	const ID = CUSTOM_RECORD_ID_ATTRIBUTE

	type RemapCase = TestCase & {
		/** The ids of the logical node types, then of the data object types, the document holds after the remap. */
		expectedTypes: { LNodeType: string[]; DOType: string[] }
	}

	const testCases: SclTest.TestCases<RemapCase> = {
		'every referrer of the old logical node types remapped to the new ones → the old types and the data object type only they name are gone':
			{
				sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<IED name="IED1" ${ID}="ied-1">
						<AccessPoint name="AP1" ${ID}="ap-1">
							<Server ${ID}="srv-1">
								<LDevice inst="LD0" ${ID}="ld-1">
									<LN0 lnClass="LLN0" inst="" lnType="OLD_LLN0" ${ID}="ln0-1"/>
									<LN lnClass="XCBR" inst="1" prefix="" lnType="OLD_XCBR" ${ID}="ln-1"/>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
					<DataTypeTemplates ${ID}="dtt-1">
						<LNodeType id="OLD_LLN0" lnClass="LLN0" ${ID}="lnt-0">
							<DO name="Mod" type="MODE_ENC" ${ID}="do-0"/>
						</LNodeType>
						<LNodeType id="OLD_XCBR" lnClass="XCBR" ${ID}="lnt-1">
							<DO name="Pos" type="OLD_DPC" ${ID}="do-1"/>
						</LNodeType>
						<LNodeType id="NEW_LLN0" lnClass="LLN0" ${ID}="lnt-new-0">
							<DO name="Mod" type="MODE_ENC" ${ID}="do-new-0"/>
						</LNodeType>
						<LNodeType id="NEW_XCBR" lnClass="XCBR" ${ID}="lnt-new-1">
							<DO name="Pos" type="NEW_DPC" ${ID}="do-new-1"/>
						</LNodeType>
						<DOType id="OLD_DPC" cdc="DPC" ${ID}="dot-1">
							<DA name="stVal" bType="Dbpos" fc="ST" ${ID}="da-1"/>
						</DOType>
						<DOType id="MODE_ENC" cdc="ENC" ${ID}="dot-mode">
							<DA name="stVal" bType="BOOLEAN" fc="ST" ${ID}="da-mode"/>
						</DOType>
						<DOType id="NEW_DPC" cdc="DPC" ${ID}="dot-new-1">
							<DA name="stVal" bType="Dbpos" fc="ST" ${ID}="da-new-1"/>
						</DOType>
					</DataTypeTemplates>
				</SCL>
			`,
				records: [
					{ tagName: 'LN0', id: 'ln0-1' },
					{ tagName: 'LN', id: 'ln-1' },
				],
				idRemap: [
					['OLD_LLN0', 'NEW_LLN0'],
					['OLD_XCBR', 'NEW_XCBR'],
				],
				// MODE_ENC is named by the new logical node type too: it stays; OLD_DPC was named by the old one only
				expectedTypes: {
					LNodeType: ['NEW_LLN0', 'NEW_XCBR'],
					DOType: ['MODE_ENC', 'NEW_DPC'],
				},
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<RemapCase>): Promise<SclTest.ActResult> {
		await source.transaction(async (tx) => {
			await applyTypeIdRemap(tx, {
				records: testCase.records,
				idRemap: new Map(testCase.idRemap),
			})
		})

		async function idsOf(tagName: 'LNodeType' | 'DOType'): Promise<string[]> {
			const records = await source.query.getRecordsByTagName(tagName)
			return records.map((record) => readAttribute({ record, name: 'id', defaults: 'none' })).sort()
		}
		const logicalNodeTypeIds = await idsOf('LNodeType')
		const dataObjectTypeIds = await idsOf('DOType')
		expect({ LNodeType: logicalNodeTypeIds, DOType: dataObjectTypeIds }).toEqual(
			testCase.expectedTypes,
		)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
