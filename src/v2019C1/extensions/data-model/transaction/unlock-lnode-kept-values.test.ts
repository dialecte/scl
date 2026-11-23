import keptValuesXml from './fixtures/unlock-lnode/kept-values.xml?raw'
import { kept } from './fixtures/unlock-lnode/refs'
import { unlockLNode } from './unlock-lnode'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { KeptValue } from './unlock-lnode.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * `removed-values.xml` and `kept-values.xml`: one LNode bound to the IED's CSWI1, one `DOS` per case named after it,
 * each naming its own `DOI` of the LN (the `DOS` `Missing` none). The type's `DA` `imported` has `valImport="true"`,
 * `silent` none, `setKind` `valKind="Set"` only, `withDefault` `valImport="true"` and a default `Val` 4.
 */
describe('unlockLNode: the values it keeps', () => {
	type TestCase = SclTest.BaseXmlTestCase & { kept: KeptValue }

	const testCases: SclTest.TestCases<TestCase> = {
		// DOI OwnFalse: DAI imported writing valImport false
		'DAI valImport false over a DA valImport true -> kept, not-imported': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="OwnFalse"]/default:DAI/default:Val'],
			kept: kept({ name: 'own-false', reason: 'not-imported' }),
		},
		// DOI Silent: DAI silent, DA silent
		'DAI and DA silent on valImport -> kept, not-imported (the default is false)': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="Silent"]/default:DAI/default:Val'],
			kept: kept({ name: 'silent', reason: 'not-imported' }),
		},
		// DOI SetKind: DA setKind has valKind Set, no valImport
		'DA valKind Set without valImport -> kept, not-imported': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="SetKind"]/default:DAI/default:Val'],
			kept: kept({ name: 'set-kind', reason: 'not-imported' }),
		},
		// DOI TwoValues: DAI imported with two Val 1
		'two Val -> kept, not-one-value': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="TwoValues"]/default:DAI[count(default:Val)=2]'],
			kept: kept({ name: 'two-values', reason: 'not-one-value' }),
		},
		// DOI NoValue: DAI imported, no Val
		'DAI without Val -> kept, not-one-value': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="NoValue"]/default:DAI'],
			kept: kept({ name: 'no-value', reason: 'not-one-value' }),
		},
		// DOI SettingGroup: Val 1 with sGroup 1
		'Val of a setting group -> kept, setting-group': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="SettingGroup"]/default:DAI/default:Val[@sGroup="1"]'],
			kept: kept({ name: 'setting-group', reason: 'setting-group' }),
		},
		// DOI Changed: Val 9, its DAS 1
		'value other than specified -> kept, value-changed': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="Changed"]/default:DAI/default:Val[text()="9"]'],
			kept: kept({ name: 'changed', reason: 'value-changed' }),
		},
		// DOI DefaultChanged: its DAS holds no Val, Val 6, the DA withDefault's 4
		'DAS without Val, value other than the DA type default -> kept, value-changed': {
			sourceXml: keptValuesXml,
			expectedQueries: [
				'//default:DOI[@name="DefaultChanged"]/default:DAI/default:Val[text()="6"]',
			],
			kept: kept({ name: 'default-changed', reason: 'value-changed' }),
		},
		// DOI Unspecified: its DAS holds no Val, DA imported has no default
		'DAS without Val, DA type without default -> kept, no-specified-value': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="Unspecified"]/default:DAI/default:Val'],
			kept: kept({ name: 'unspecified', reason: 'no-specified-value' }),
		},
		// DOI SpecTwoValues: its DAS holds Val 1 and Val 2, the DAI Val 1
		'DAS with two Val -> kept, no-specified-value: it names no one value': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="SpecTwoValues"]/default:DAI/default:Val[text()="1"]'],
			kept: kept({ name: 'spec-two-values', reason: 'no-specified-value' }),
		},
		// DOI SpecSettingGroup: its DAS holds only a Val of setting group 1 (4), the DAI Val 4 as the type default
		'DAS with only a setting-group Val -> kept, no-specified-value: the type default does not apply':
			{
				sourceXml: keptValuesXml,
				expectedQueries: [
					'//default:DOI[@name="SpecSettingGroup"]/default:DAI/default:Val[text()="4"]',
				],
				kept: kept({ name: 'spec-setting-group', reason: 'no-specified-value' }),
			},
		// DOI SpecBlank: its DAS holds one blank Val, the DAI Val 4 as the DA withDefault's default
		'DAS with one blank Val -> kept, no-specified-value: the type default does not apply': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="SpecBlank"]/default:DAI/default:Val[text()="4"]'],
			kept: kept({ name: 'spec-blank', reason: 'no-specified-value' }),
		},
		// DOI MultiDefault: its DAS holds no Val; the DA multiDefault holds Val 7 and Val 8 of setting group 1; the DAI Val 7
		'type default with a setting-group Val beside its plain one -> kept, no-specified-value': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="MultiDefault"]/default:DAI/default:Val[text()="7"]'],
			kept: kept({ name: 'multi-default', reason: 'no-specified-value' }),
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await source.transaction((tx) =>
				unlockLNode(tx, { lnode: { tagName: 'LNode', id: 'lnode' } }),
			)
			expect(result).toEqual(
				expect.objectContaining({ kept: expect.arrayContaining([testCase.kept]) }),
			)
			return { assertOn: 'source' }
		},
	})
})
