import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ResolvedTuplePair, TupleReferenceDraft } from './resolve-tuple.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// IED7 holds XCBR1 and XCBR2 in LD1, and a data set DS
const IED7 = /* xml */ `
	<SCL ${ns} ${id}="root">
		<IED name="IED7" uuid="ied7" ${id}="ied7">
			<AccessPoint name="AP1" uuid="ap7" ${id}="ap7">
				<Server ${id}="server7">
					<Authentication ${id}="auth7"/>
					<LDevice inst="LD1" uuid="ld7" ${id}="ld7">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" uuid="ln07" ${id}="ln07">
							<DataSet name="DS" ${id}="ds7"/>
						</LN0>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" uuid="xcbr1" ${id}="xcbr1"/>
						<LN lnClass="XCBR" inst="2" lnType="XCBR_T" uuid="xcbr2" ${id}="xcbr2"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="templates">
			<LNodeType id="LLN0_T" lnClass="LLN0" ${id}="lln0-type"/>
			<LNodeType id="XCBR_T" lnClass="XCBR" ${id}="xcbr-type"><DO name="Pos" type="DPC_T" ${id}="pos"/></LNodeType>
			<DOType id="DPC_T" cdc="DPC" ${id}="dpc-type"><DA name="stVal" bType="Dbpos" fc="ST" ${id}="pos-st"/></DOType>
		</DataTypeTemplates>
	</SCL>
`

const IED7_DATA_SET = { tagName: 'DataSet', id: 'ds7' } as Scl.Ref<Scl.ElementsOf>
const IED7_DEVICE = { tagName: 'LDevice', id: 'ld7' } as Scl.Ref<Scl.ElementsOf>

function entryFor(lnInst: string): TupleReferenceDraft {
	return {
		tagName: 'FCDA',
		attributes: {
			ldInst: 'LD1',
			lnClass: 'XCBR',
			lnInst,
			doName: 'Pos',
			daName: 'stVal',
			fc: 'ST',
		},
	}
}

describe('query.reference.resolveTuples answers each reference in input order, its reads shared', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		references: { reference: TupleReferenceDraft; parent: Scl.Ref<Scl.ElementsOf> }[]
		expected: ResolvedTuplePair[][]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's data set; entries for XCBR2, XCBR9 (which IED7 lacks) and XCBR1
		'three entries, one naming nothing → one answer each, in input order': {
			sourceXml: IED7,
			references: [
				{ reference: entryFor('2'), parent: IED7_DATA_SET },
				{ reference: entryFor('9'), parent: IED7_DATA_SET },
				{ reference: entryFor('1'), parent: IED7_DATA_SET },
			],
			expected: [
				[{ uuidAttribute: 'lnUuid', uuid: 'xcbr2', target: { tagName: 'LN', id: 'xcbr2' } }],
				[],
				[{ uuidAttribute: 'lnUuid', uuid: 'xcbr1', target: { tagName: 'LN', id: 'xcbr1' } }],
			],
		},
		// IED7, asked about no reference
		'no reference → nothing': {
			sourceXml: IED7,
			references: [],
			expected: [],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		await expect(
			source.query.reference.resolveTuples({ references: testCase.references }),
		).resolves.toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('query.reference.resolveTuple inside a transaction answers its staged writes', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		created: { tagName: string; attributes: Record<string, string> }
		reference: TupleReferenceDraft
		expected: ResolvedTuplePair[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// IED7's device gets XCBR5 in the transaction, then an entry for it is resolved before the commit
		'a logical node the transaction created → its uuid': {
			sourceXml: IED7,
			created: {
				tagName: 'LN',
				attributes: { lnClass: 'XCBR', inst: '5', lnType: 'XCBR_T', uuid: 'xcbr5' },
			},
			reference: entryFor('5'),
			expected: [
				{ uuidAttribute: 'lnUuid', uuid: 'xcbr5', target: { tagName: 'LN', id: 'created' } },
			],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		await source.transaction(async function resolveStaged(tx) {
			const node = await tx.any.addChild(IED7_DEVICE, {
				tagName: testCase.created.tagName,
				attributes: testCase.created.attributes,
				id: 'created',
			})
			await expect(
				tx.reference.resolveTuple({ reference: testCase.reference, parent: IED7_DATA_SET }),
			).resolves.toEqual(testCase.expected)
			await tx.any.delete(node)
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})
