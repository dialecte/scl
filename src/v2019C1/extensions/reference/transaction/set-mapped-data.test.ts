import { setMappedData } from './set-mapped-data'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SetMappedDataParams, SetMappedDataResult } from './set-mapped-data.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const PTOC1 = { tagName: 'LN', id: 'ptoc1' } as const
const GGIO1 = { tagName: 'LN', id: 'ggio1' } as const

/** An SCL with one LNode mapped to PTOC1 holding `data`. */
function mappedLNode(data: string): string {
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="sub" name="S1">
				<Function ${id}="fn" name="F1">
					<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
						<Private ${id}="priv" type="eIEC61850-6-100">${data}</Private>
					</LNode>
				</Function>
			</Substation>
			<IED ${id}="ied" name="VENDOR">
				<AccessPoint ${id}="ap" name="AP1">
					<Server ${id}="srv">
						<LDevice ${id}="ld" inst="LD0">
							<LN ${id}="ptoc1" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc1-uuid"/>
							<LN ${id}="ggio1" lnClass="GGIO" inst="1" lnType="GGIO_T" uuid="ggio1-uuid"/>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
		</SCL>
	`
}

type TestCase = SclTest.BaseXmlTestCase & {
	params: SetMappedDataParams
	expected: SetMappedDataResult
}

describe('setMappedData', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'DOS Mod implemented by Health in the LNode logical node -> stored, Health and the uuid': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod"/>`),
			params: {
				reference: { tagName: 'DOS', id: 'dos-mod' },
				implementation: { ln: PTOC1, dataPath: ['Health'] },
			},
			expected: { kind: 'stored' },
			expectedQueries: [
				'//v2019C1:DOS[@name="Mod"][@mappedDoName="Health"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'DOS Op implemented by Op in the LNode logical node -> default, nothing stored': {
			sourceXml: mappedLNode(
				/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedDoName="Ind2" mappedLnUuid="ggio1-uuid"/>`,
			),
			params: {
				reference: { tagName: 'DOS', id: 'dos-op' },
				implementation: { ln: PTOC1, dataPath: ['Op'] },
			},
			expected: { kind: 'default' },
			expectedQueries: ['//v2019C1:DOS[@name="Op"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS Op implemented by Op in another logical node -> stored, name kept': {
			sourceXml: mappedLNode(/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-op" name="Op"/>`),
			params: {
				reference: { tagName: 'DOS', id: 'dos-op' },
				implementation: { ln: GGIO1, dataPath: ['Op'] },
			},
			expected: { kind: 'stored' },
			expectedQueries: [
				'//v2019C1:DOS[@name="Op"][@mappedDoName="Op"][@mappedLnUuid="ggio1-uuid"]',
			],
		},

		'DAS implemented by another DO attribute -> stored with the full path': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-op" name="Op">
					<eIEC61850-6-100:DAS ${id}="das-general" name="general"/>
				</eIEC61850-6-100:DOS>
			`),
			params: {
				reference: { tagName: 'DAS', id: 'das-general' },
				implementation: { ln: PTOC1, dataPath: ['Ind2', 'stVal'] },
			},
			expected: { kind: 'stored' },
			expectedQueries: [
				'//v2019C1:DAS[@name="general"][@mappedDaName="Ind2.stVal"][@mappedLnUuid="ptoc1-uuid"]',
			],
		},

		'SDS standing for an attribute structure given a deviation -> inexpressible, nothing written': {
			sourceXml: mappedLNode(/* xml */ `
				<eIEC61850-6-100:DOS ${id}="dos-pos" name="Pos">
					<eIEC61850-6-100:SDS ${id}="sds-sbow" name="SBOw"/>
				</eIEC61850-6-100:DOS>
			`),
			params: {
				reference: { tagName: 'SDS', id: 'sds-sbow' },
				implementation: { ln: PTOC1, dataPath: ['Pos', 'Oper'] },
			},
			expected: { kind: 'inexpressible' },
			expectedQueries: ['//v2019C1:SDS[@name="SBOw"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},

		'DOS with a pair, no implementation given -> default, pair removed': {
			sourceXml: mappedLNode(
				/* xml */ `<eIEC61850-6-100:DOS ${id}="dos-mod" name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid"/>`,
			),
			params: { reference: { tagName: 'DOS', id: 'dos-mod' } },
			expected: { kind: 'default' },
			expectedQueries: ['//v2019C1:DOS[@name="Mod"][not(@mappedDoName)][not(@mappedLnUuid)]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const result = await source.transaction((tx) => setMappedData(tx, testCase.params))
		expect(result).toEqual(testCase.expected)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
