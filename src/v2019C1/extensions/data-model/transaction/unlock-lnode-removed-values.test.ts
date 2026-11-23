import { ref } from './fixtures/unlock-lnode/refs'
import removedValuesXml from './fixtures/unlock-lnode/removed-values.xml?raw'
import { unlockLNode } from './unlock-lnode'

import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { RemovedData } from './unlock-lnode.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * `removed-values.xml` and `kept-values.xml`: one LNode bound to the IED's CSWI1, one `DOS` per case named after it,
 * each naming its own `DOI` of the LN (the `DOS` `Missing` none). The type's `DA` `imported` has `valImport="true"`,
 * `silent` none, `setKind` `valKind="Set"` only, `withDefault` `valImport="true"` and a default `Val` 4.
 */
describe('unlockLNode: the values it removes', () => {
	type TestCase = SclTest.BaseXmlTestCase & { removed: RemovedData[] }

	const testCases: SclTest.TestCases<TestCase> = {
		// DOI Equal: DAI imported, Val 1 as its DAS
		'imported value (DA valImport true) as specified -> its Val, then the DAI and DOI left empty, removed':
			{
				sourceXml: removedValuesXml,
				unexpectedQueries: ['//default:DOI[@name="Equal"]'],
				removed: [
					ref({ tagName: 'Val', name: 'equal' }),
					ref({ tagName: 'DAI', name: 'equal' }),
					ref({ tagName: 'DOI', name: 'equal' }),
				],
			},
		// DOI Trimmed: Val '  1 ', its DAS 1
		'value equal once trimmed -> removed': {
			sourceXml: removedValuesXml,
			unexpectedQueries: ['//default:DOI[@name="Trimmed"]'],
			removed: [
				ref({ tagName: 'Val', name: 'trimmed' }),
				ref({ tagName: 'DAI', name: 'trimmed' }),
				ref({ tagName: 'DOI', name: 'trimmed' }),
			],
		},
		// DOI OwnImport: DAI silent writing valImport true, Val 1 as its DAS
		'DAI valImport true over a silent DA -> only the Val removed: the DAI keeps its valImport': {
			sourceXml: removedValuesXml,
			expectedQueries: ['//default:DOI[@name="OwnImport"]/default:DAI[@valImport="true"][not(*)]'],
			removed: [ref({ tagName: 'Val', name: 'own-import' })],
		},
		// DOI DefaultEqual: its DAS holds no Val, Val 4 as the DA withDefault's
		'DAS without Val, value equal to the DA type default -> removed': {
			sourceXml: removedValuesXml,
			unexpectedQueries: ['//default:DOI[@name="DefaultEqual"]'],
			removed: [
				ref({ tagName: 'Val', name: 'default-equal' }),
				ref({ tagName: 'DAI', name: 'default-equal' }),
				ref({ tagName: 'DOI', name: 'default-equal' }),
			],
		},
		// DOI ShortAddress: DAI imported with sAddr, Val 1 as its DAS
		'DAI with an sAddr -> its Val removed, the DAI and DOI kept': {
			sourceXml: removedValuesXml,
			expectedQueries: ['//default:DOI[@name="ShortAddress"]/default:DAI[@sAddr="40001"][not(*)]'],
			removed: [ref({ tagName: 'Val', name: 'short-address' })],
		},
		// DOI Described: DAI imported with desc, Val 1 as its DAS
		'DAI with a desc -> its Val removed, the DAI kept': {
			sourceXml: removedValuesXml,
			expectedQueries: [
				'//default:DOI[@name="Described"]/default:DAI[@desc="described value"][not(*)]',
			],
			removed: [ref({ tagName: 'Val', name: 'described' })],
		},
		// DOI ObjectDescribed (desc): DAI imported, Val 1 as its DAS
		'DOI with a desc -> the Val and DAI removed, the DOI kept': {
			sourceXml: removedValuesXml,
			expectedQueries: [
				'//default:LN/default:DOI[@name="ObjectDescribed"][@desc="described object"][not(*)]',
			],
			removed: [
				ref({ tagName: 'Val', name: 'object-described' }),
				ref({ tagName: 'DAI', name: 'object-described' }),
			],
		},
		// DOI Shared: DAI imported as its DAS beside DAI silent (30)
		'DOI holding another DAI -> the Val and DAI removed, the DOI and the other DAI kept': {
			sourceXml: removedValuesXml,
			expectedQueries: [
				'//default:DOI[@name="Shared"]/default:DAI[@name="silent"]/default:Val[text()="30"]',
			],
			unexpectedQueries: ['//default:DOI[@name="Shared"]/default:DAI[@name="imported"]'],
			removed: [ref({ tagName: 'Val', name: 'shared' }), ref({ tagName: 'DAI', name: 'shared' })],
		},
		// DOI Nested / SDI sub / DAI setVal 5, as its DAS under SDS sub
		'value specified through an SDS -> its Val, DAI, SDI and DOI removed': {
			sourceXml: removedValuesXml,
			unexpectedQueries: ['//default:DOI[@name="Nested"]'],
			removed: [
				ref({ tagName: 'Val', name: 'nested' }),
				ref({ tagName: 'DAI', name: 'nested' }),
				ref({ tagName: 'SDI', name: 'nested' }),
				ref({ tagName: 'DOI', name: 'nested' }),
			],
		},
		// DOI NestedShared / SDI sub: DAI setVal 5 as its DAS, beside DAI other
		'SDI holding another DAI -> the Val and DAI removed, the SDI and DOI kept': {
			sourceXml: removedValuesXml,
			expectedQueries: [
				'//default:DOI[@name="NestedShared"]/default:SDI/default:DAI[@name="other"]/default:Val',
			],
			unexpectedQueries: ['//default:DOI[@name="NestedShared"]//default:DAI[@name="setVal"]'],
			removed: [
				ref({ tagName: 'Val', name: 'nested-shared' }),
				ref({ tagName: 'DAI', name: 'nested-shared' }),
			],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await source.transaction((tx) =>
				unlockLNode(tx, { lnode: { tagName: 'LNode', id: 'lnode' } }),
			)
			expect(result).toEqual(
				expect.objectContaining({ removed: expect.arrayContaining(testCase.removed) }),
			)
			const start = result.removed.findIndex((entry) => entry.id === testCase.removed[0].id)
			expect(result.removed.slice(start, start + testCase.removed.length)).toEqual(testCase.removed)
			return { assertOn: 'source' }
		},
	})
})
