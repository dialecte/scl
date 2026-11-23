import { importTypes } from './import-types'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const ns = ALL_XMLNS_NAMESPACES
const id = CUSTOM_RECORD_ID_ATTRIBUTE

/** A source whose LNodeType LLN0_X no logical node names. */
const SOURCE_WITH_A_BARE_TYPE = /* xml */ `
	<SCL ${ns} ${id}="scl-s">
		<DataTypeTemplates>
			<LNodeType id="LLN0_X" lnClass="LLN0"><DO name="Beh" type="ENS_X"/></LNodeType>
			<DOType id="ENS_X" cdc="ENS"><DA name="stVal" fc="ST" bType="Enum" type="Beh_X"/></DOType>
			<EnumType id="Beh_X"><EnumVal ord="1">on</EnumVal></EnumType>
		</DataTypeTemplates>
	</SCL>`

/** `importTypes` given LNodeType ids: the closure is walked from the type itself, no logical node naming it. */
describe('importTypes - LNodeTypes given by id', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		lnodeTypeIds: string[]
		idRemap: Record<string, string>
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'LLN0_X named by no logical node, its id given, empty target → LLN0_X, ENS_X and Beh_X cloned under their ids':
			{
				sourceXml: SOURCE_WITH_A_BARE_TYPE,
				targetXml: `<SCL ${ns} ${id}="scl-t"><Header id="target"/></SCL>`,
				lnodeTypeIds: ['LLN0_X'],
				idRemap: { LLN0_X: 'LLN0_X', ENS_X: 'ENS_X', Beh_X: 'Beh_X' },
				expectedQueries: [
					'//default:DataTypeTemplates/default:LNodeType[@id="LLN0_X"][@lnClass="LLN0"]/default:DO[@type="ENS_X"]',
					'//default:DataTypeTemplates/default:DOType[@id="ENS_X"]/default:DA[@type="Beh_X"]',
					'//default:DataTypeTemplates/default:EnumType[@id="Beh_X"]/default:EnumVal[@ord="1"]',
				],
			},
		'LLN0_X given by id, the target holding an equal LLN0_T → LLN0_X reused as LLN0_T, nothing cloned':
			{
				sourceXml: SOURCE_WITH_A_BARE_TYPE,
				targetXml: /* xml */ `
				<SCL ${ns} ${id}="scl-t">
					<DataTypeTemplates>
						<LNodeType id="LLN0_T" lnClass="LLN0"><DO name="Beh" type="ENS_T"/></LNodeType>
						<DOType id="ENS_T" cdc="ENS"><DA name="stVal" fc="ST" bType="Enum" type="Beh_T"/></DOType>
						<EnumType id="Beh_T"><EnumVal ord="1">on</EnumVal></EnumType>
					</DataTypeTemplates>
				</SCL>`,
				lnodeTypeIds: ['LLN0_X'],
				idRemap: { LLN0_X: 'LLN0_T', ENS_X: 'ENS_T', Beh_X: 'Beh_T' },
				unexpectedQueries: ['//default:LNodeType[@id="LLN0_X"]', '//default:DOType[@id="ENS_X"]'],
			},
	}

	runSclTestCases.withExport<TestCase>({
		testCases,
		act: async ({ source, target, testCase }) => {
			const imported = target?.transaction((tx) =>
				importTypes(tx, {
					sourceQuery: source.query,
					records: [],
					lnodeTypeIds: testCase.lnodeTypeIds,
				}),
			)
			await expect(
				Promise.resolve(imported).then((result) => Object.fromEntries(result?.idRemap ?? [])),
			).resolves.toEqual(testCase.idRemap)
			return { assertOn: 'target' }
		},
	})
})
