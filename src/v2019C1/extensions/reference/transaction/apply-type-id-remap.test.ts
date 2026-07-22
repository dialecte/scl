import { applyTypeIdRemap } from './apply-type-id-remap'

import { describe } from 'vitest'

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
							</LDevice>
						</Server>
					</AccessPoint>
				</IED>
				<DataTypeTemplates ${ID}="dtt-1">
					<LNodeType id="OLD_XCBR" lnClass="XCBR" ${ID}="lnt-1">
						<DO name="Pos" type="OLD_DPC" ${ID}="do-1"/>
					</LNodeType>
					<DOType id="OLD_DPC" cdc="DPC" ${ID}="dot-1"/>
				</DataTypeTemplates>
			</SCL>`,
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
				'//default:LN[@lnType="OLD_XCBR"]',
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
			</SCL>`,
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
			</SCL>`,
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
