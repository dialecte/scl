import keptValuesXml from './fixtures/unlock-lnode/kept-values.xml?raw'
import { kept, ref } from './fixtures/unlock-lnode/refs'
import removedValuesXml from './fixtures/unlock-lnode/removed-values.xml?raw'
import walkedValuesXml from './fixtures/unlock-lnode/walked-values.xml?raw'
import { unlockLNode } from './unlock-lnode'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { RemovedData, UnlockLNodeResult } from './unlock-lnode.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * `removed-values.xml` and `kept-values.xml`: one LNode bound to the IED's CSWI1, one `DOS` per case named after it,
 * each naming its own `DOI` of the LN (the `DOS` `Missing` none). The type's `DA` `imported` has `valImport="true"`,
 * `silent` none, `setKind` `valKind="Set"` only, `withDefault` `valImport="true"` and a default `Val` 4.
 */
describe('unlockLNode: what it answers', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: UnlockLNodeResult }

	const testCases: SclTest.TestCases<TestCase> = {
		// every DOS of removed-values.xml; Missing names no DOI
		'only owned values -> each removed, each value its Val then its containers walking up, nothing kept':
			{
				sourceXml: removedValuesXml,
				expectedQueries: [
					'//default:LNode[@iedName="None"][not(@lnUuid)][@lnClass="CSWI"][@lnInst="1"]',
				],
				unexpectedQueries: ['//default:DOI[@name="Equal"]', '//default:DOI[@name="Nested"]'],
				expected: {
					removed: [
						ref({ tagName: 'Val', name: 'equal' }),
						ref({ tagName: 'DAI', name: 'equal' }),
						ref({ tagName: 'DOI', name: 'equal' }),
						ref({ tagName: 'Val', name: 'trimmed' }),
						ref({ tagName: 'DAI', name: 'trimmed' }),
						ref({ tagName: 'DOI', name: 'trimmed' }),
						ref({ tagName: 'Val', name: 'own-import' }),
						ref({ tagName: 'Val', name: 'default-equal' }),
						ref({ tagName: 'DAI', name: 'default-equal' }),
						ref({ tagName: 'DOI', name: 'default-equal' }),
						ref({ tagName: 'Val', name: 'short-address' }),
						ref({ tagName: 'Val', name: 'described' }),
						ref({ tagName: 'Val', name: 'object-described' }),
						ref({ tagName: 'DAI', name: 'object-described' }),
						ref({ tagName: 'Val', name: 'shared' }),
						ref({ tagName: 'DAI', name: 'shared' }),
						ref({ tagName: 'Val', name: 'nested' }),
						ref({ tagName: 'DAI', name: 'nested' }),
						ref({ tagName: 'SDI', name: 'nested' }),
						ref({ tagName: 'DOI', name: 'nested' }),
						ref({ tagName: 'Val', name: 'nested-shared' }),
						ref({ tagName: 'DAI', name: 'nested-shared' }),
					],
					kept: [],
				},
			},
		// every DOS of kept-values.xml
		'only kept values -> nothing removed, each listed with its reason': {
			sourceXml: keptValuesXml,
			expectedQueries: ['//default:DOI[@name="Changed"]/default:DAI/default:Val'],
			expected: {
				removed: [],
				kept: [
					kept({ name: 'own-false', reason: 'not-imported' }),
					kept({ name: 'silent', reason: 'not-imported' }),
					kept({ name: 'set-kind', reason: 'not-imported' }),
					kept({ name: 'two-values', reason: 'not-one-value' }),
					kept({ name: 'no-value', reason: 'not-one-value' }),
					kept({ name: 'setting-group', reason: 'setting-group' }),
					kept({ name: 'changed', reason: 'value-changed' }),
					kept({ name: 'default-changed', reason: 'value-changed' }),
					kept({ name: 'unspecified', reason: 'no-specified-value' }),
					kept({ name: 'spec-two-values', reason: 'no-specified-value' }),
					kept({ name: 'spec-setting-group', reason: 'no-specified-value' }),
					kept({ name: 'spec-blank', reason: 'no-specified-value' }),
					kept({ name: 'multi-default', reason: 'no-specified-value' }),
				],
			},
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await source.transaction((tx) =>
				unlockLNode(tx, { lnode: { tagName: 'LNode', id: 'lnode' } }),
			)
			const { removed, kept: keptValues } = testCase.expected
			expect(result).toEqual({
				removed: expect.arrayContaining(removed),
				kept: expect.arrayContaining(keptValues),
			})
			expect(result.removed).toHaveLength(removed.length)
			expect(result.kept).toHaveLength(keptValues.length)
			return { assertOn: 'source' }
		},
	})
})

describe('unlockLNode: the data it walks to', () => {
	type TestCase = SclTest.BaseXmlTestCase & { removed: RemovedData[] }

	const testCases: SclTest.TestCases<TestCase> = {
		// walked-values.xml, DOI Struct / SDI mag / DAI f 2.5: its DAS maps Struct.mag.f, the BDA f has valImport true, the DA mag none
		'value of a BDA in a struct, valImport from the BDA -> its Val, DAI, SDI and DOI removed': {
			sourceXml: walkedValuesXml,
			unexpectedQueries: ['//default:DOI[@name="Struct"]'],
			removed: [
				ref({ tagName: 'Val', name: 'struct' }),
				ref({ tagName: 'DAI', name: 'struct' }),
				ref({ tagName: 'SDI', name: 'struct' }),
				ref({ tagName: 'DOI', name: 'struct' }),
			],
		},
		// walked-values.xml, DOI Indexed: DAI arr ix 0 and DAI arr ix 1, both Val 3; its DAS arr ix 1 Val 3
		'value of an array element -> only the element its DAS indexes removed': {
			sourceXml: walkedValuesXml,
			expectedQueries: [
				'//default:DOI[@name="Indexed"]/default:DAI[@ix="0"]/default:Val[text()="3"]',
			],
			unexpectedQueries: ['//default:DOI[@name="Indexed"]/default:DAI[@ix="1"]'],
			removed: [ref({ tagName: 'Val', name: 'indexed' }), ref({ tagName: 'DAI', name: 'indexed' })],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await source.transaction((tx) =>
				unlockLNode(tx, { lnode: { tagName: 'LNode', id: 'lnode' } }),
			)
			expect(result).toEqual({
				removed: expect.arrayContaining(testCase.removed),
				kept: [],
			})
			const start = result.removed.findIndex((entry) => entry.id === testCase.removed[0].id)
			expect(result.removed.slice(start, start + testCase.removed.length)).toEqual(testCase.removed)
			return { assertOn: 'source' }
		},
	})
})

describe('unlockLNode: an LNode assigned to no IED', () => {
	type TestCase = SclTest.BaseXmlTestCase & { expected: UnlockLNodeResult }

	const testCases: SclTest.TestCases<TestCase> = {
		'nothing to unlock -> nothing removed, nothing listed, its values stay': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="substation" name="S1">
						<Function ${id}="function" name="F1">
							<LNode ${id}="lnode" iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_T">
								<Private ${id}="lnode-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:DOS ${id}="dos-equal" name="Equal">
										<eIEC61850-6-100:DAS ${id}="das-equal" name="imported"><eIEC61850-6-100:Val>1</eIEC61850-6-100:Val></eIEC61850-6-100:DAS>
									</eIEC61850-6-100:DOS>
								</Private>
							</LNode>
						</Function>
					</Substation>
					<IED ${id}="ied" name="P1">
						<AccessPoint ${id}="access-point" name="AP1">
							<Server ${id}="server">
								<LDevice ${id}="ldevice" inst="LD0">
									<LN ${id}="ln" prefix="" lnClass="CSWI" inst="1" lnType="CSWI_T" uuid="ln-uuid">
										<DOI ${id}="doi-equal" name="Equal"><DAI ${id}="dai-equal" name="imported" valImport="true"><Val ${id}="val-equal">1</Val></DAI></DOI>
									</LN>
								</LDevice>
							</Server>
						</AccessPoint>
					</IED>
				</SCL>
			`,
			expectedQueries: ['//default:DOI[@name="Equal"]/default:DAI/default:Val[text()="1"]'],
			expected: { removed: [], kept: [] },
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			const result = await source.transaction((tx) =>
				unlockLNode(tx, { lnode: { tagName: 'LNode', id: 'lnode' } }),
			)
			expect(result).toEqual(testCase.expected)
			return { assertOn: 'source' }
		},
	})
})
