import typesOfOtherTagsSharingIdsXml from './fixtures/types-of-other-tags-sharing-ids.xml?raw'
import typesSharingIdsXml from './fixtures/types-sharing-ids.xml?raw'
import { resolve } from './resolve'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { DataTypeTag } from './resolve.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE

/** The type ids of each list `resolve` answers, in order. */
type Expected = { lnodeTypes: string[]; doTypes: string[]; daTypes: string[]; enumTypes: string[] }

type RecordRef = Scl.Ref<'LNode'> | Scl.Ref<'LN'> | Scl.Ref<'LN0'>

/** LNodes, an LN and an LN0 of two LNodeTypes sharing DOTypes; an SDO stored before the DAs of its DOType; a DO naming no DOType; a DA of no type. */
const MIXED_XML = /* xml */ `
	<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
		<Substation name="S1" ${ID}="sub-1">
			<VoltageLevel name="V1" ${ID}="vl-1">
				<Bay name="B1" ${ID}="bay-1">
					<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="T1" ${ID}="lnode-1"/>
					<LNode iedName="None" lnClass="CSWI" lnInst="2" ${ID}="lnode-no-type"/>
					<LNode iedName="None" lnClass="CSWI" lnInst="3" lnType="T1" ${ID}="lnode-3"/>
				</Bay>
			</VoltageLevel>
		</Substation>
		<IED name="IED1" ${ID}="ied-1">
			<AccessPoint name="AP1" ${ID}="ap-1">
				<Server ${ID}="server-1">
					<Authentication ${ID}="auth-1"/>
					<LDevice inst="LD1" ${ID}="ld-1">
						<LN0 lnClass="LLN0" inst="" lnType="T2" ${ID}="ln0-1"/>
						<LN lnClass="CSWI" inst="1" lnType="T1" ${ID}="ln-1"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${ID}="dtt-1">
			<LNodeType id="T2" lnClass="LLN0" ${ID}="lnt-2">
				<DO name="Mod" type="ENC" ${ID}="do-2-mod"/>
				<DO name="Beh" type="ENS" ${ID}="do-2-beh"/>
				<DO name="Gone" type="GONE" ${ID}="do-2-gone"/>
			</LNodeType>
			<LNodeType id="T1" lnClass="CSWI" ${ID}="lnt-1">
				<DO name="Beh" type="ENS" ${ID}="do-1-beh"/>
				<DO name="Pos" type="DPC" ${ID}="do-1-pos"/>
			</LNodeType>
			<DOType id="DPC" cdc="DPC" ${ID}="dot-dpc">
				<SDO name="sub" type="SUB" ${ID}="sdo-dpc-sub"/>
				<DA name="origin" bType="Struct" type="ORIG" fc="ST" ${ID}="da-dpc-origin"/>
				<DA name="stVal" bType="Enum" type="DBPOS" fc="ST" ${ID}="da-dpc-stval"/>
				<DA name="q" bType="Quality" fc="ST" ${ID}="da-dpc-q"/>
			</DOType>
			<DOType id="SUB" cdc="SPS" ${ID}="dot-sub">
				<DA name="stVal" bType="Enum" type="BEH" fc="ST" ${ID}="da-sub-stval"/>
			</DOType>
			<DOType id="ENS" cdc="ENS" ${ID}="dot-ens">
				<DA name="stVal" bType="Enum" type="BEH" fc="ST" ${ID}="da-ens-stval"/>
			</DOType>
			<DOType id="ENC" cdc="ENC" ${ID}="dot-enc">
				<DA name="stVal" bType="Enum" type="BEH" fc="ST" ${ID}="da-enc-stval"/>
				<DA name="origin" bType="Struct" type="ORIG" fc="ST" ${ID}="da-enc-origin"/>
			</DOType>
			<DAType id="ORIG" ${ID}="dat-orig">
				<BDA name="orCat" bType="Enum" type="ORCAT" ${ID}="bda-orig-orcat"/>
				<BDA name="sub" bType="Struct" type="LEAF" ${ID}="bda-orig-sub"/>
			</DAType>
			<DAType id="LEAF" ${ID}="dat-leaf">
				<BDA name="f" bType="FLOAT32" ${ID}="bda-leaf-f"/>
			</DAType>
			<DAType id="UNUSED" ${ID}="dat-unused">
				<BDA name="f" bType="FLOAT32" ${ID}="bda-unused-f"/>
			</DAType>
			<EnumType id="ORCAT" ${ID}="et-orcat">
				<EnumVal ord="0" ${ID}="ev-orcat-0">not-supported</EnumVal>
			</EnumType>
			<EnumType id="BEH" ${ID}="et-beh">
				<EnumVal ord="1" ${ID}="ev-beh-1">on</EnumVal>
			</EnumType>
			<EnumType id="DBPOS" ${ID}="et-dbpos">
				<EnumVal ord="0" ${ID}="ev-dbpos-0">off</EnumVal>
			</EnumType>
		</DataTypeTemplates>
	</SCL>`

const MIXED_FIXTURE = {
	sourceXml: MIXED_XML,
	allowIncoherentReferences: 'a DO naming a DOType the document lacks is skipped',
}

/** The first record of the tag a lookup by each id answers, as the query or transaction gives it. */
async function lookUp(params: {
	query: Core.Query<Config>
	tagName: DataTypeTag
	ids: string[]
}): Promise<unknown[]> {
	const { query, tagName, ids } = params
	const found: unknown[] = []
	for (const id of ids) {
		const [record] = await query.findByAttributes({ tagName, attributes: { id } })
		found.push(record)
	}
	return found
}

/** `resolve` of the records answers, list by list, the records a lookup by id gives for the expected ids. */
async function expectResolved(params: {
	query: Core.Query<Config>
	refs: RecordRef[]
	expected: Expected
}): Promise<void> {
	const { query, refs, expected } = params
	const records = await query.getRecords(refs)
	const given = records.filter((record) => !!record) as Parameters<typeof resolve>[1]['records']
	const result = await resolve(query, { records: given })
	const lnodeTypes = await lookUp({ query, tagName: 'LNodeType', ids: expected.lnodeTypes })
	const doTypes = await lookUp({ query, tagName: 'DOType', ids: expected.doTypes })
	const daTypes = await lookUp({ query, tagName: 'DAType', ids: expected.daTypes })
	const enumTypes = await lookUp({ query, tagName: 'EnumType', ids: expected.enumTypes })
	expect(result).toEqual({ lnodeTypes, doTypes, daTypes, enumTypes })
}

/**
 * The records `resolve` answers are those a lookup by id gives (tracked, the status included), in the walk's order:
 * per record its LNodeType, per DO its DOType, then that DOType's DAs (EnumType, DAType depth-first) before its SDOs.
 */
describe('resolve - the records', () => {
	type TestCase = SclTest.BaseXmlTestCase & { records: RecordRef[]; expected: Expected }

	const testCases: SclTest.TestCases<TestCase> = {
		'LNodes, an LN and an LN0 of two types sharing DOTypes → each type once, in walk order': {
			...MIXED_FIXTURE,
			records: [
				{ tagName: 'LNode', id: 'lnode-1' },
				{ tagName: 'LNode', id: 'lnode-no-type' },
				{ tagName: 'LN0', id: 'ln0-1' },
				{ tagName: 'LN', id: 'ln-1' },
				{ tagName: 'LNode', id: 'lnode-3' },
			],
			expected: {
				lnodeTypes: ['T1', 'T2'],
				doTypes: ['ENS', 'DPC', 'SUB', 'ENC'],
				daTypes: ['ORIG', 'LEAF'],
				enumTypes: ['BEH', 'ORCAT', 'DBPOS'],
			},
		},
		'the LN0 first → its types first': {
			...MIXED_FIXTURE,
			records: [
				{ tagName: 'LN0', id: 'ln0-1' },
				{ tagName: 'LNode', id: 'lnode-1' },
			],
			expected: {
				lnodeTypes: ['T2', 'T1'],
				doTypes: ['ENC', 'ENS', 'DPC', 'SUB'],
				daTypes: ['ORIG', 'LEAF'],
				enumTypes: ['BEH', 'ORCAT', 'DBPOS'],
			},
		},
		'no record → nothing': {
			...MIXED_FIXTURE,
			records: [],
			expected: { lnodeTypes: [], doTypes: [], daTypes: [], enumTypes: [] },
		},
		'two DATypes sharing an id → the one a lookup by id answers, walked': {
			sourceXml: /* xml */ `
				<SCL ${ALL_XMLNS_NAMESPACES} ${ID}="scl-1">
					<Substation name="S1" ${ID}="sub-1">
						<VoltageLevel name="V1" ${ID}="vl-1">
							<Bay name="B1" ${ID}="bay-1">
								<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="T1" ${ID}="lnode-1"/>
							</Bay>
						</VoltageLevel>
					</Substation>
					<DataTypeTemplates ${ID}="dtt-1">
						<LNodeType id="T1" lnClass="CSWI" ${ID}="lnt-1">
							<DO name="Pos" type="DPC" ${ID}="do-1-pos"/>
						</LNodeType>
						<DOType id="DPC" cdc="DPC" ${ID}="dot-dpc">
							<DA name="origin" bType="Struct" type="DUP" fc="ST" ${ID}="da-dpc-origin"/>
						</DOType>
						<DAType id="DUP" ${ID}="dat-dup-a">
							<BDA name="orCat" bType="Enum" type="E_A" ${ID}="bda-a"/>
						</DAType>
						<DAType id="DUP" ${ID}="dat-dup-b">
							<BDA name="orCat" bType="Enum" type="E_B" ${ID}="bda-b"/>
						</DAType>
						<EnumType id="E_A" ${ID}="et-a">
							<EnumVal ord="0" ${ID}="ev-a">a</EnumVal>
						</EnumType>
						<EnumType id="E_B" ${ID}="et-b">
							<EnumVal ord="0" ${ID}="ev-b">b</EnumVal>
						</EnumType>
					</DataTypeTemplates>
				</SCL>`,
			allowInvalidFixture: {
				reason: 'two DATypes of one id: resolve keeps the one a lookup by id answers',
				violations: [{ check: 'uniqueness' }],
			},
			records: [{ tagName: 'LNode', id: 'lnode-1' }],
			expected: { lnodeTypes: ['T1'], doTypes: ['DPC'], daTypes: ['DUP'], enumTypes: ['E_A'] },
		},
		'LNodeTypes, DOTypes and EnumTypes sharing ids, a DO inside a Private → the ones a lookup by id answers, the wrapped DO left out':
			{
				// each of TD, DD and ED held twice; TD's first record holds its second DO inside a Private
				sourceXml: typesSharingIdsXml,
				allowInvalidFixture: {
					reason: 'types sharing an id: resolve keeps the one a lookup by id answers',
					violations: [{ check: 'uniqueness' }],
				},
				records: [{ tagName: 'LNode', id: 'lnode-dup' }],
				expected: { lnodeTypes: ['TD'], doTypes: ['DD'], daTypes: [], enumTypes: ['ED'] },
			},
		'a DOType and an EnumType sharing an id, a Struct DA naming an id only a DOType holds → each by its own tag':
			{
				// DOType X and EnumType X; DOType X holds an Enum DA of type X, a Struct DA of type Y (only DOType Y), an SDO of type Y
				sourceXml: typesOfOtherTagsSharingIdsXml,
				allowIncoherentReferences: 'a Struct DA naming an id no DAType holds is skipped',
				allowInvalidFixture: {
					reason: 'a DOType and an EnumType sharing an id: each is looked up under its own tag',
					violations: [{ check: 'uniqueness' }],
				},
				records: [{ tagName: 'LNode', id: 'lnode-1' }],
				expected: { lnodeTypes: ['T1'], doTypes: ['X', 'Y'], daTypes: [], enumTypes: ['X'] },
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await expectResolved({
				query: source.query,
				refs: testCase.records,
				expected: testCase.expected,
			})
		},
	})
})

/** Inside a transaction `resolve` answers the staged types: the records the transaction's own lookup by id gives. */
describe('resolve - inside a transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		records: RecordRef[]
		/** Staged before the call, in the transaction it runs in. */
		stage: (tx: Core.Transaction<Config>) => Promise<void>
		expected: Expected
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'inside a transaction → the staged types, their status included': {
			...MIXED_FIXTURE,
			records: [{ tagName: 'LNode', id: 'lnode-1' }],
			stage: async (tx) => {
				await tx.update({ tagName: 'LNodeType', id: 'lnt-1' }, { attributes: { desc: 'staged' } })
				await tx.update({ tagName: 'EnumType', id: 'et-dbpos' }, { attributes: { desc: 'staged' } })
				const added = await tx.addChild(
					{ tagName: 'DataTypeTemplates', id: 'dtt-1' },
					{ tagName: 'DOType', attributes: { id: 'ADDED', cdc: 'SPS' } },
				)
				await tx.addChild(added, {
					tagName: 'DA',
					attributes: { name: 'stVal', bType: 'BOOLEAN', fc: 'ST' },
				})
				await tx.update({ tagName: 'DO', id: 'do-1-beh' }, { attributes: { type: 'ADDED' } })
			},
			expected: {
				lnodeTypes: ['T1'],
				doTypes: ['ADDED', 'DPC', 'SUB'],
				daTypes: ['ORIG', 'LEAF'],
				enumTypes: ['ORCAT', 'DBPOS', 'BEH'],
			},
		},
		'a DOType deleted inside the transaction → left out, as a DO naming no DOType': {
			...MIXED_FIXTURE,
			records: [{ tagName: 'LNode', id: 'lnode-1' }],
			stage: async (tx) => {
				await tx.delete({ tagName: 'DOType', id: 'dot-dpc' })
			},
			expected: { lnodeTypes: ['T1'], doTypes: ['ENS'], daTypes: [], enumTypes: ['BEH'] },
		},
		'a DO deleted inside the transaction → its DOType left out': {
			...MIXED_FIXTURE,
			records: [{ tagName: 'LNode', id: 'lnode-1' }],
			stage: async (tx) => {
				await tx.delete({ tagName: 'DO', id: 'do-1-beh' })
			},
			expected: {
				lnodeTypes: ['T1'],
				doTypes: ['DPC', 'SUB'],
				daTypes: ['ORIG', 'LEAF'],
				enumTypes: ['ORCAT', 'DBPOS', 'BEH'],
			},
		},
		'an SDO deleted inside the transaction → its DOType left out': {
			// DOType X holds an SDO of type Y, deleted before the call
			sourceXml: typesOfOtherTagsSharingIdsXml,
			allowIncoherentReferences: 'a Struct DA naming an id no DAType holds is skipped',
			allowInvalidFixture: {
				reason: 'a DOType and an EnumType sharing an id: each is looked up under its own tag',
				violations: [{ check: 'uniqueness' }],
			},
			records: [{ tagName: 'LNode', id: 'lnode-1' }],
			stage: async (tx) => {
				await tx.delete({ tagName: 'SDO', id: 'sdo-x-sub' })
			},
			expected: { lnodeTypes: ['T1'], doTypes: ['X'], daTypes: [], enumTypes: ['X'] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			await source.transaction(async (tx) => {
				await testCase.stage(tx)
				await expectResolved({ query: tx, refs: testCase.records, expected: testCase.expected })
			})
		},
	})
})

/** An `lnType` naming no LNodeType is refused, also when another type of the data model holds that id. */
describe('resolve - refused', () => {
	type TestCase = SclTest.BaseXmlTestCase & { records: RecordRef[]; expected: { key: string } }

	const FIXTURE = {
		// each of TD, DD and ED held twice; ONLY_DOTYPE is the id of a DOType only
		sourceXml: typesSharingIdsXml,
		allowInvalidFixture: {
			reason: 'types sharing an id: resolve keeps the one a lookup by id answers',
			violations: [{ check: 'uniqueness' as const }],
		},
		allowIncoherentReferences: 'an lnType naming no LNodeType is what resolve refuses',
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'an lnType no record holds → ELEMENT_NOT_FOUND': {
			...FIXTURE,
			records: [{ tagName: 'LNode', id: 'lnode-nowhere' }],
			expected: { key: 'ELEMENT_NOT_FOUND' },
		},
		'an lnType only a DOType holds → ELEMENT_NOT_FOUND': {
			...FIXTURE,
			records: [{ tagName: 'LNode', id: 'lnode-on-dotype' }],
			expected: { key: 'ELEMENT_NOT_FOUND' },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const query = source.query
			const records = await query.getRecords(testCase.records)
			const given = records.filter((record) => !!record) as Parameters<typeof resolve>[1]['records']
			const refusal = await resolve(query, { records: given }).catch((error: unknown) =>
				toDialecteError(error),
			)
			expect(refusal).toMatchObject(testCase.expected)
		},
	})
})
