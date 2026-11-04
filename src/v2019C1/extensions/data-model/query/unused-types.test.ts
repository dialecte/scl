import { collectUnusedTypes, lostTypeNames } from './unused-types'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestRecord,
	runSclTestCases,
} from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { LostTypeNames } from './unused-types.types'
import type { Scl } from '@/v2019C1/config'
import type { TypeIdTarget } from '@/v2019C1/extensions/reference'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// ── lostTypeNames: the log of a transaction, read as a pure function ────────────────────────────────

const PARENT = { tagName: 'Function', id: 'function' } as const
const DO_TYPE_PARENT = { tagName: 'DOType', id: 'dot-D1' } as const

function lnode(params: {
	id?: string
	lnType?: string
	desc?: string
}): Scl.RawRecord<Scl.ElementsOf> {
	const { id: recordId = 'lnode', lnType, desc } = params
	return createSclTestRecord({
		record: {
			tagName: 'LNode',
			id: recordId,
			parent: PARENT,
			attributes: {
				iedName: 'None',
				lnClass: 'XCBR',
				lnInst: '1',
				...(lnType === undefined ? {} : { lnType }),
				...(desc === undefined ? {} : { desc }),
			},
		},
	})
}

function bay(): Scl.RawRecord<Scl.ElementsOf> {
	return createSclTestRecord({
		record: {
			tagName: 'Bay',
			id: 'bay',
			parent: { tagName: 'VoltageLevel', id: 'voltage-level' },
			attributes: { name: 'B1' },
		},
	})
}

function dataAttribute(params: {
	bType: string
	type?: string
	name?: string
}): Scl.RawRecord<Scl.ElementsOf> {
	const { bType, type, name = 'stVal' } = params
	return createSclTestRecord({
		record: {
			tagName: 'DA',
			id: 'da',
			parent: DO_TYPE_PARENT,
			attributes: { name, fc: 'ST', bType, ...(type === undefined ? {} : { type }) },
		},
	})
}

function dataObject(params: { type: string }): Scl.RawRecord<Scl.ElementsOf> {
	return createSclTestRecord({
		record: {
			tagName: 'DO',
			id: 'do',
			parent: { tagName: 'LNodeType', id: 'lnt-T' },
			attributes: { name: 'Beh', type: params.type },
		},
	})
}

function created(newRecord: Scl.RawRecord<Scl.ElementsOf>): Scl.Operation {
	return { status: 'created', oldRecord: undefined, newRecord }
}

function updated(
	oldRecord: Scl.RawRecord<Scl.ElementsOf>,
	newRecord: Scl.RawRecord<Scl.ElementsOf>,
): Scl.Operation {
	return { status: 'updated', oldRecord, newRecord }
}

function deleted(oldRecord: Scl.RawRecord<Scl.ElementsOf>): Scl.Operation {
	return { status: 'deleted', oldRecord, newRecord: undefined }
}

type LostCase = SclTest.BaseTestCase & {
	/** The transaction log. */
	operations: Scl.Operation[]
	/** The names lost, each with the tags of type that may carry it. */
	expected: Record<string, TypeIdTarget[]>
}

/** The lost names as a plain object, each name's targets sorted: the order the reader finds them in is not a contract. */
function summarizeLost(lost: LostTypeNames): Record<string, TypeIdTarget[]> {
	return Object.fromEntries(
		[...lost]
			.sort(([first], [second]) => first.localeCompare(second))
			.map(([name, targets]) => [name, [...targets].sort()]),
	)
}

// A type is a candidate only when a referrer it had before the transaction stopped naming it: `before` is the first
// operation's old record, `after` the last one's new record, per record id.
describe('lostTypeNames', () => {
	const testCases: Record<string, LostCase> = {
		'an LNode naming T deleted → T, an LNodeType': {
			operations: [deleted(lnode({ lnType: 'T' }))],
			expected: { T: ['LNodeType'] },
		},
		'an LNode whose lnType goes from T to U → T': {
			operations: [updated(lnode({ lnType: 'T' }), lnode({ lnType: 'U' }))],
			expected: { T: ['LNodeType'] },
		},
		'an LNode whose lnType goes T → U → T → none': {
			operations: [
				updated(lnode({ lnType: 'T' }), lnode({ lnType: 'U' })),
				updated(lnode({ lnType: 'U' }), lnode({ lnType: 'T' })),
			],
			expected: {},
		},
		'an LNode created then deleted → none': {
			operations: [created(lnode({ lnType: 'T' })), deleted(lnode({ lnType: 'T' }))],
			expected: {},
		},
		'a DA of bType Enum naming E deleted → E, a DAType or an EnumType (the keep test ignores bType)':
			{
				operations: [deleted(dataAttribute({ bType: 'Enum', type: 'E' }))],
				expected: { E: ['DAType', 'EnumType'] },
			},
		'a Bay deleted, a tag that names no type → none': {
			operations: [deleted(bay())],
			expected: {},
		},
		'a DO whose type goes from D1 to D2 → D1, a DOType': {
			operations: [updated(dataObject({ type: 'D1' }), dataObject({ type: 'D2' }))],
			expected: { D1: ['DOType'] },
		},
		'an LNode created naming T → none': {
			operations: [created(lnode({ lnType: 'T' }))],
			expected: {},
		},
		'an LNode updated on another attribute than lnType → none': {
			operations: [updated(lnode({ lnType: 'T' }), lnode({ lnType: 'T', desc: 'renamed' }))],
			expected: {},
		},
	}

	runSclTestCases.generic(testCases, ({ operations, expected }) => {
		expect(summarizeLost(lostTypeNames(operations))).toEqual(expected)
	})
})

// ── collectUnusedTypes: the document as the transaction leaves it ──────────────────────────────────

function at(recordId: string): string {
	return `${id}="${recordId}"`
}

/** An LNodeType `typeId` whose data objects are `name → DOType id`. */
function lnodeType(params: {
	typeId: string
	dataObjects: Record<string, string>
	lnClass?: string
}): string {
	const { typeId, dataObjects, lnClass = 'XCBR' } = params
	const objects = Object.entries(dataObjects).map(
		([name, type]) => `<DO name="${name}" type="${type}" ${at(`do-${typeId}-${name}`)}/>`,
	)
	return `<LNodeType id="${typeId}" lnClass="${lnClass}" ${at(`lnt-${typeId}`)}>${objects.join('')}</LNodeType>`
}

/** A DOType `typeId` holding `members` (SDO / DA elements). */
function doType(params: { typeId: string; members?: string }): string {
	const { typeId, members = '' } = params
	return `<DOType id="${typeId}" cdc="SPS" ${at(`dot-${typeId}`)}>${members}</DOType>`
}

/** A sub data object of DOType `owner` naming the DOType `type`. */
function sdo(params: { owner: string; name: string; type: string }): string {
	const { owner, name, type } = params
	return `<SDO name="${name}" type="${type}" ${at(`sdo-${owner}-${name}`)}/>`
}

/** A data attribute of DOType `owner`; `type` names an EnumType or a DAType by `bType`. */
function dataAttributeXml(params: {
	owner: string
	name: string
	bType: string
	type?: string
	val?: string
}): string {
	const { owner, name, bType, type, val } = params
	const typeAttribute = type === undefined ? '' : ` type="${type}"`
	const value = val === undefined ? '' : `<Val ${at(`val-${owner}-${name}`)}>${val}</Val>`
	return `<DA name="${name}" fc="ST" bType="${bType}"${typeAttribute} ${at(`da-${owner}-${name}`)}>${value}</DA>`
}

/** A DAType `typeId` holding one BDA per `name → [bType, type]`. */
function daType(params: { typeId: string; members: Record<string, [string, string?]> }): string {
	const { typeId, members } = params
	const attributes = Object.entries(members).map(([name, [bType, type]]) => {
		const typeAttribute = type === undefined ? '' : ` type="${type}"`
		return `<BDA name="${name}" bType="${bType}"${typeAttribute} ${at(`bda-${typeId}-${name}`)}/>`
	})
	return `<DAType id="${typeId}" ${at(`dat-${typeId}`)}>${attributes.join('')}</DAType>`
}

function enumType(typeId: string): string {
	return `<EnumType id="${typeId}" ${at(`et-${typeId}`)}><EnumVal ord="0" ${at(`ev-${typeId}`)}>off</EnumVal></EnumType>`
}

/** The document: logical nodes in a function, a logical node of an IED, and the data type templates in their order. */
function documentXml(params: {
	lnodes?: Record<string, string>
	iedLogicalNodeType?: string
	lnodeTypes: string[]
	doTypes: string[]
	daTypes?: string[]
	enumTypes?: string[]
}): string {
	const { lnodes = {}, iedLogicalNodeType = 'LLN0_T', lnodeTypes, doTypes } = params
	const { daTypes = [], enumTypes = [] } = params
	const logicalNodes = Object.entries(lnodes).map(
		([recordId, type], index) =>
			`<LNode iedName="None" lnClass="XCBR" lnInst="${index + 1}" lnType="${type}" ${at(recordId)}/>`,
	)
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="substation">
				<VoltageLevel name="V1" ${id}="voltage-level"><Bay name="B1" ${id}="bay"/></VoltageLevel>
				<Function name="F1" ${id}="function">${logicalNodes.join('')}</Function>
			</Substation>
			<IED name="IED1" ${id}="ied">
				<AccessPoint name="AP1" ${id}="access-point">
					<Server ${id}="server">
						<Authentication ${id}="authentication"/>
						<LDevice inst="LD0" ${id}="logical-device">
							<LN0 lnClass="LLN0" inst="" lnType="${iedLogicalNodeType}" ${id}="ln0"/>
						</LDevice>
					</Server>
				</AccessPoint>
			</IED>
			<DataTypeTemplates ${id}="dtt">
				${[...lnodeTypes, ...doTypes, ...daTypes, ...enumTypes].join('\n')}
			</DataTypeTemplates>
		</SCL>
	`
}

/** The logical node type of the IED's LN0 and its one data object type, named by nothing else: the document's fixed part. */
const IED_TYPES = {
	lnodeType: lnodeType({ typeId: 'LLN0_T', dataObjects: { Mod: 'LLN0_Mod' }, lnClass: 'LLN0' }),
	doType: doType({ typeId: 'LLN0_Mod' }),
}

type CollectCase = SclTest.BaseXmlTestCase & {
	/** The names the transaction lost (type id → the tags of type that may carry it). */
	names: Record<string, TypeIdTarget[]>
	/** The record ids the transaction deletes: a referrer among them does not count. */
	gone?: string[]
	/** The roots of the pruned types, as `<tag> <record id>`, sorted. */
	expectedRoots: string[]
	/** Every record of the pruned types, as `<tag> <record id>`, sorted; left out when the case does not check them. */
	expectedRecords?: string[]
	/**
	 * The reads of one pass are bounded: no (tag, attribute) pair read twice, at most 4 resolve + 7 referrer reads
	 * (11) whatever the number of rounds.
	 */
	expectReadsBounded?: boolean
}

describe('collectUnusedTypes', () => {
	const testCases: SclTest.TestCases<CollectCase> = {
		'T named by nothing, its DOType D only its → T and D, every record of both and of the types below':
			{
				sourceXml: documentXml({
					lnodeTypes: [lnodeType({ typeId: 'T', dataObjects: { Beh: 'D' } }), IED_TYPES.lnodeType],
					doTypes: [
						doType({
							typeId: 'D',
							members:
								dataAttributeXml({ owner: 'D', name: 'stVal', bType: 'Enum', type: 'E' }) +
								dataAttributeXml({ owner: 'D', name: 'd', bType: 'VisString255', val: 'x' }),
						}),
						IED_TYPES.doType,
					],
					enumTypes: [enumType('E')],
				}),
				names: { T: ['LNodeType'] },
				expectedRoots: ['DOType dot-D', 'EnumType et-E', 'LNodeType lnt-T'],
				expectedRecords: [
					'DA da-D-d',
					'DA da-D-stVal',
					'DO do-T-Beh',
					'DOType dot-D',
					'EnumType et-E',
					'EnumVal ev-E',
					'LNodeType lnt-T',
					'Val val-D-d',
				],
			},
		'T named by an LNode → none': {
			sourceXml: documentXml({
				lnodes: { lnode: 'T' },
				lnodeTypes: [lnodeType({ typeId: 'T', dataObjects: { Beh: 'D' } }), IED_TYPES.lnodeType],
				doTypes: [doType({ typeId: 'D' }), IED_TYPES.doType],
			}),
			names: { T: ['LNodeType'] },
			expectedRoots: [],
		},
		'T named by an LNode that is among the deleted ones → T and D': {
			sourceXml: documentXml({
				lnodes: { lnode: 'T' },
				lnodeTypes: [lnodeType({ typeId: 'T', dataObjects: { Beh: 'D' } }), IED_TYPES.lnodeType],
				doTypes: [doType({ typeId: 'D' }), IED_TYPES.doType],
			}),
			names: { T: ['LNodeType'] },
			gone: ['lnode'],
			expectedRoots: ['DOType dot-D', 'LNodeType lnt-T'],
		},
		'T named by nothing, D named by the LN0 type too → T alone': {
			sourceXml: documentXml({
				iedLogicalNodeType: 'U',
				lnodeTypes: [
					lnodeType({ typeId: 'T', dataObjects: { Beh: 'D' } }),
					lnodeType({ typeId: 'U', dataObjects: { Mod: 'D' }, lnClass: 'LLN0' }),
				],
				doTypes: [doType({ typeId: 'D' })],
			}),
			names: { T: ['LNodeType'] },
			expectedRoots: ['LNodeType lnt-T'],
		},
		'T and a DOType D1 whose SDO names D2, T naming both → T, D1 and D2 (D2 judged again once D1 is gone)':
			{
				sourceXml: documentXml({
					lnodeTypes: [
						lnodeType({ typeId: 'T', dataObjects: { Beh: 'D1', Mod: 'D2' } }),
						IED_TYPES.lnodeType,
					],
					doTypes: [
						doType({ typeId: 'D1', members: sdo({ owner: 'D1', name: 'sdoB', type: 'D2' }) }),
						doType({ typeId: 'D2' }),
						IED_TYPES.doType,
					],
				}),
				names: { T: ['LNodeType'] },
				expectedRoots: ['DOType dot-D1', 'DOType dot-D2', 'LNodeType lnt-T'],
			},
		'the three-round chain → each (tag, attribute) of the document read once, whatever the rounds':
			{
				sourceXml: documentXml({
					lnodeTypes: [
						lnodeType({ typeId: 'T', dataObjects: { Beh: 'D1', Mod: 'D2' } }),
						IED_TYPES.lnodeType,
					],
					doTypes: [
						doType({ typeId: 'D1', members: sdo({ owner: 'D1', name: 'sdoB', type: 'D2' }) }),
						doType({ typeId: 'D2' }),
						IED_TYPES.doType,
					],
				}),
				names: { T: ['LNodeType'] },
				expectedRoots: ['DOType dot-D1', 'DOType dot-D2', 'LNodeType lnt-T'],
				// a non-memoised pass re-reads the DOType and its referrers (DO, SDO) in the third round: a repeated pair, and more than 11 reads
				expectReadsBounded: true,
			},
		'an EnumType E named by two DATypes, one pruned → that DAType, E stays': {
			sourceXml: documentXml({
				lnodes: { lnode: 'T2' },
				lnodeTypes: [lnodeType({ typeId: 'T2', dataObjects: { Beh: 'D2' } }), IED_TYPES.lnodeType],
				doTypes: [
					doType({
						typeId: 'D2',
						members: dataAttributeXml({ owner: 'D2', name: 'origin', bType: 'Struct', type: 'A2' }),
					}),
					IED_TYPES.doType,
				],
				daTypes: [
					daType({ typeId: 'A1', members: { orCat: ['Enum', 'E'] } }),
					daType({ typeId: 'A2', members: { orCat: ['Enum', 'E'] } }),
				],
				enumTypes: [enumType('E')],
			}),
			names: { A1: ['DAType'] },
			expectedRoots: ['DAType dat-A1'],
		},
		'an EnumType E named by two DATypes, both pruned → both and E': {
			sourceXml: documentXml({
				lnodeTypes: [lnodeType({ typeId: 'T2', dataObjects: { Beh: 'D2' } }), IED_TYPES.lnodeType],
				doTypes: [doType({ typeId: 'D2' }), IED_TYPES.doType],
				daTypes: [
					daType({ typeId: 'A1', members: { orCat: ['Enum', 'E'] } }),
					daType({ typeId: 'A2', members: { orCat: ['Enum', 'E'] } }),
				],
				enumTypes: [enumType('E')],
			}),
			names: { A1: ['DAType'], A2: ['DAType'] },
			expectedRoots: ['DAType dat-A1', 'DAType dat-A2', 'EnumType et-E'],
		},
		'a DA of bType Struct naming an EnumType E elsewhere → E stays (the keep test ignores bType)': {
			sourceXml: documentXml({
				lnodes: { lnode: 'T2' },
				lnodeTypes: [
					lnodeType({ typeId: 'T', dataObjects: { Beh: 'D1' } }),
					lnodeType({ typeId: 'T2', dataObjects: { Beh: 'D2' } }),
					IED_TYPES.lnodeType,
				],
				doTypes: [
					doType({
						typeId: 'D1',
						members: dataAttributeXml({ owner: 'D1', name: 'stVal', bType: 'Enum', type: 'E' }),
					}),
					doType({
						typeId: 'D2',
						members: dataAttributeXml({ owner: 'D2', name: 'origin', bType: 'Struct', type: 'E' }),
					}),
					IED_TYPES.doType,
				],
				enumTypes: [enumType('E')],
			}),
			names: { T: ['LNodeType'] },
			expectedRoots: ['DOType dot-D1', 'LNodeType lnt-T'],
		},
		'a type U unused before the transaction names D → U stays and keeps D': {
			sourceXml: documentXml({
				lnodeTypes: [
					lnodeType({ typeId: 'T', dataObjects: { Beh: 'D' } }),
					lnodeType({ typeId: 'U', dataObjects: { Beh: 'D' } }),
					IED_TYPES.lnodeType,
				],
				doTypes: [doType({ typeId: 'D' }), IED_TYPES.doType],
			}),
			names: { T: ['LNodeType'] },
			expectedRoots: ['LNodeType lnt-T'],
		},
		'two DOTypes naming each other by SDO, T naming one → T alone, the cycle stays': {
			sourceXml: documentXml({
				lnodeTypes: [lnodeType({ typeId: 'T', dataObjects: { Beh: 'D1' } }), IED_TYPES.lnodeType],
				doTypes: [
					doType({ typeId: 'D1', members: sdo({ owner: 'D1', name: 'sdoB', type: 'D2' }) }),
					doType({ typeId: 'D2', members: sdo({ owner: 'D2', name: 'sdoA', type: 'D1' }) }),
					IED_TYPES.doType,
				],
			}),
			names: { T: ['LNodeType'] },
			expectedRoots: ['LNodeType lnt-T'],
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const names: LostTypeNames = new Map(Object.entries(testCase.names))
			const gone = new Set(testCase.gone ?? [])
			const { query, calls } = countQueryReads(source.query)
			await expect(
				collectUnusedTypes({ query, names, gone }).then((unused) => ({
					roots: unused.trees.map(({ root }) => `${root.tagName} ${root.id}`).sort(),
					records: unused.trees
						.flatMap((tree) => tree.records.map((record) => `${record.tagName} ${record.id}`))
						.sort(),
					gone: [...unused.gone].sort(),
					...readsOf(calls),
				})),
			).resolves.toMatchObject({
				roots: testCase.expectedRoots,
				...(testCase.expectedRecords
					? {
							records: testCase.expectedRecords,
							gone: [...(testCase.gone ?? []), ...testCase.expectedRecords.map(recordIdOf)].sort(),
						}
					: {}),
				...(testCase.expectReadsBounded ? { repeatedReads: [], withinBound: true } : {}),
			})
		},
	})
})

/** The record id of a `<tag> <id>` line. */
function recordIdOf(line: string): string {
	return line.slice(line.indexOf(' ') + 1)
}

/**
 * The reads of the pass: the (tag[, attribute]) pairs read more than once (`findByAttributes` by tag and attribute,
 * `getRecordsByTagName` by tag; the by-id reads of a subtree have no pair), and whether all the reads are at most 11.
 */
function readsOf(calls: CountedQueryCall[]): { repeatedReads: string[]; withinBound: boolean } {
	const seen = new Set<string>()
	const repeated = new Set<string>()
	for (const pair of calls.flatMap(readPairsOf)) {
		if (seen.has(pair)) repeated.add(pair)
		seen.add(pair)
	}
	return { repeatedReads: [...repeated].sort(), withinBound: calls.length <= 11 }
}

function readPairsOf({ method, args }: CountedQueryCall): string[] {
	if (method === 'getRecordsByTagName') return [String(args[0])]
	if (method !== 'findByAttributes') return []
	const [params] = args as [{ tagName: string; attributes: Record<string, unknown> }]
	return Object.keys(params.attributes).map((attribute) => `${params.tagName}.${attribute}`)
}
