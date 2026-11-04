import { pruneUnusedTypes } from './prune-unused-types'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	assertExpectedElementQueries,
	assertUnexpectedElementQueries,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestRecord,
	runSclTestCases,
} from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'
import { storedAmong } from '@/v2019C1/test/stored-among'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const XMLNS_VENDOR_NAMESPACE = 'xmlns:vendor="http://vendor.example/private-elements"'

// ── fixture builders: the data type templates, in the order the schema wants them ───────────────────

function at(recordId: string): string {
	return `${id}="${recordId}"`
}

/** A tool's Private holding a foreign element, first in the element that holds it. */
function vendorPrivate(owner: string): string {
	return `<Private type="vendor-note" ${at(`private-${owner}`)}><vendor:Note ${at(`note-${owner}`)}/></Private>`
}

/** An LNodeType `typeId` whose data objects are `name → DOType id`. */
function lnodeType(params: {
	typeId: string
	dataObjects: Record<string, string>
	lnClass?: string
	withPrivate?: boolean
}): string {
	const { typeId, dataObjects, lnClass = 'XCBR', withPrivate = false } = params
	const objects = Object.entries(dataObjects).map(
		([name, type]) => `<DO name="${name}" type="${type}" ${at(`do-${typeId}-${name}`)}/>`,
	)
	const note = withPrivate ? vendorPrivate(typeId) : ''
	return `<LNodeType id="${typeId}" lnClass="${lnClass}" ${at(`lnt-${typeId}`)}>${note}${objects.join('')}</LNodeType>`
}

/** A data attribute of DOType `owner`; `type` names an EnumType or a DAType by `bType`. */
function dataAttribute(params: {
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

function doType(params: { typeId: string; members?: string; withPrivate?: boolean }): string {
	const { typeId, members = '', withPrivate = false } = params
	const note = withPrivate ? vendorPrivate(typeId) : ''
	return `<DOType id="${typeId}" cdc="SPS" ${at(`dot-${typeId}`)}>${note}${members}</DOType>`
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

type TypeParts = {
	lnodeTypes?: string[]
	doTypes?: string[]
	daTypes?: string[]
	enumTypes?: string[]
}

/** A chain: logical node type T → DOType D → an EnumType E and a DAType A → an EnumType E2. */
const CHAIN_T: TypeParts = {
	lnodeTypes: [lnodeType({ typeId: 'T', dataObjects: { Beh: 'D' } })],
	doTypes: [
		doType({
			typeId: 'D',
			members:
				dataAttribute({ owner: 'D', name: 'stVal', bType: 'Enum', type: 'E', val: 'off' }) +
				dataAttribute({ owner: 'D', name: 'origin', bType: 'Struct', type: 'A' }),
		}),
	],
	daTypes: [daType({ typeId: 'A', members: { orCat: ['Enum', 'E2'] } })],
	enumTypes: [enumType('E'), enumType('E2')],
}

/** The same chain with a Private holding a foreign element in T and in D. */
const CHAIN_T_WITH_PRIVATE: TypeParts = {
	...CHAIN_T,
	lnodeTypes: [lnodeType({ typeId: 'T', dataObjects: { Beh: 'D' }, withPrivate: true })],
	doTypes: [
		doType({
			typeId: 'D',
			members: dataAttribute({ owner: 'D', name: 'stVal', bType: 'Enum', type: 'E' }),
			withPrivate: true,
		}),
	],
	daTypes: [],
	enumTypes: [enumType('E')],
}

const TYPE_S: TypeParts = {
	lnodeTypes: [lnodeType({ typeId: 'S', dataObjects: { Beh: 'DS' } })],
	doTypes: [doType({ typeId: 'DS' })],
}

/** A witness: named by one LNode (`lnode-w`) that a row's transaction deletes, so a row that keeps a type also sees a type go. */
const TYPE_W: TypeParts = {
	lnodeTypes: [lnodeType({ typeId: 'W', dataObjects: { Beh: 'DW' } })],
	doTypes: [doType({ typeId: 'DW' })],
}

const TYPE_U: TypeParts = {
	lnodeTypes: [lnodeType({ typeId: 'U', dataObjects: { Beh: 'DU' } })],
	doTypes: [doType({ typeId: 'DU' })],
}

/** The logical node type of an IED's LN0, and its data object type. */
const TYPE_LLN0: TypeParts = {
	lnodeTypes: [lnodeType({ typeId: 'LLN0_T', dataObjects: { Mod: 'DL' }, lnClass: 'LLN0' })],
	doTypes: [doType({ typeId: 'DL' })],
}

type DocumentParams = {
	/** Logical nodes of the function F1, by record id → the type they name. */
	functionLNodes?: Record<string, string>
	/** Logical nodes of the bay B1, by record id → the type they name. */
	bayLNodes?: Record<string, string>
	/** An IED: the type of its LN0 and its LNs (record id → type). */
	ied?: { ln0Type: string; lns?: Record<string, string> }
	types: TypeParts[]
}

function logicalNodes(entries: Record<string, string> | undefined): string {
	return Object.entries(entries ?? {})
		.map(
			([recordId, type], index) =>
				`<LNode iedName="None" lnClass="XCBR" lnInst="${index + 1}" lnType="${type}" ${at(recordId)}/>`,
		)
		.join('')
}

function iedXml(ied: DocumentParams['ied']): string {
	if (!ied) return ''
	const lns = Object.entries(ied.lns ?? {})
		.map(
			([recordId, type], index) =>
				`<LN lnClass="XCBR" inst="${index + 1}" lnType="${type}" ${at(recordId)}/>`,
		)
		.join('')
	return /* xml */ `
		<IED name="IED1" ${id}="ied">
			<AccessPoint name="AP1" ${id}="access-point">
				<Server ${id}="server">
					<Authentication ${id}="authentication"/>
					<LDevice inst="LD0" ${id}="logical-device">
						<LN0 lnClass="LLN0" inst="" lnType="${ied.ln0Type}" ${id}="ln0"/>
						${lns}
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	`
}

function documentXml(params: DocumentParams): string {
	const { functionLNodes, bayLNodes, ied, types } = params
	const parts = [
		...types.flatMap((part) => part.lnodeTypes ?? []),
		...types.flatMap((part) => part.doTypes ?? []),
		...types.flatMap((part) => part.daTypes ?? []),
		...types.flatMap((part) => part.enumTypes ?? []),
	]
	return /* xml */ `
		<SCL ${ns} ${XMLNS_VENDOR_NAMESPACE} ${id}="root">
			<Substation name="S1" ${id}="substation">
				<VoltageLevel name="V1" ${id}="voltage-level">
					<Bay name="B1" ${id}="bay">${logicalNodes(bayLNodes)}</Bay><Bay name="B2" ${id}="bay-2"/>
				</VoltageLevel>
				<Function name="F1" ${id}="function">${logicalNodes(functionLNodes)}</Function>
			</Substation>
			${iedXml(ied)}
			<DataTypeTemplates ${id}="dtt">${parts.join('\n')}</DataTypeTemplates>
		</SCL>
	`
}

// ── the refs the rows write and read ────────────────────────────────────────────────────────────────

const FUNCTION = { tagName: 'Function', id: 'function' } as const
const BAY = { tagName: 'Bay', id: 'bay' } as const
const IED = { tagName: 'IED', id: 'ied' } as const
const LNODE_T = { tagName: 'LNode', id: 'lnode-t' } as const
const LNODE_W = { tagName: 'LNode', id: 'lnode-w' } as const
const DATA_TYPE_TEMPLATES = { tagName: 'DataTypeTemplates', id: 'dtt' } as const

/** What the T chain holds, as `getRecord` finds it: every record of T, D, A, E and E2. */
const CHAIN_T_RECORDS = [
	{ tagName: 'LNodeType', id: 'lnt-T' },
	{ tagName: 'DO', id: 'do-T-Beh' },
	{ tagName: 'DOType', id: 'dot-D' },
	{ tagName: 'DA', id: 'da-D-stVal' },
	{ tagName: 'Val', id: 'val-D-stVal' },
	{ tagName: 'DA', id: 'da-D-origin' },
	{ tagName: 'DAType', id: 'dat-A' },
	{ tagName: 'BDA', id: 'bda-A-orCat' },
	{ tagName: 'EnumType', id: 'et-E' },
	{ tagName: 'EnumVal', id: 'ev-E' },
	{ tagName: 'EnumType', id: 'et-E2' },
	{ tagName: 'EnumVal', id: 'ev-E2' },
] as const satisfies readonly Scl.Ref<Scl.ElementsOf>[]

/** The queries that say the T chain is in the document / is not. */
const CHAIN_T_PRESENT = [
	'//default:LNodeType[@id="T"]',
	'//default:DOType[@id="D"]',
	'//default:DAType[@id="A"]',
	'//default:EnumType[@id="E"]',
	'//default:EnumType[@id="E2"]',
]

/** The queries that say the witness type W is gone. */
const WITNESS_GONE = ['//default:LNodeType[@id="W"]', '//default:DOType[@id="DW"]']

/** The write, then the delete of the witness's only LNode: what the row keeps stays, the witness goes. */
function withTheWitnessDeleted(
	write: (tx: Scl.Transaction) => Promise<void>,
): (tx: Scl.Transaction) => Promise<void> {
	return async function writeThenDeleteTheWitness(tx) {
		await write(tx)
		await tx.delete(LNODE_W)
	}
}

type TestCase = SclTest.BaseXmlTestCase & {
	/** What the one transaction writes. */
	write: (tx: Scl.Transaction) => Promise<void>
	/** The records that must be out of the store, not only out of the exported tree. */
	removed?: readonly Scl.Ref<Scl.ElementsOf>[]
	/** The record ids `DataTypeTemplates` lists as children after the commit, sorted; each must be a record of the store. */
	expectedTypeChildren?: string[]
}

async function deleteLNodeT(tx: Scl.Transaction): Promise<void> {
	await tx.delete(LNODE_T)
}

/** Write in one transaction, then assert inside the act: the queries on the exported document, the store, the types listed. */
async function writeThenRead({
	testCase,
	source,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	await source.transaction(testCase.write)
	const xml = (await source.query.getSnapshot({ as: 'xml' })) as string
	expect(() =>
		assertExpectedElementQueries({ xml, queries: testCase.expectedQueries ?? [] }),
	).not.toThrow()
	expect(() =>
		assertUnexpectedElementQueries({ xml, queries: testCase.unexpectedQueries ?? [] }),
	).not.toThrow()
	if (testCase.removed) {
		const stored = await storedAmong({ document: source, refs: testCase.removed })
		expect(stored).toEqual([])
	}
	if (testCase.expectedTypeChildren) {
		const record = await source.query.getRecord(DATA_TYPE_TEMPLATES)
		const children = record?.children ?? []
		const stored = await storedAmong({
			document: source,
			refs: children as Scl.Ref<Scl.ElementsOf>[],
		})
		expect({
			children: children.map((child) => child.id).sort(),
			stored: stored.length,
		}).toEqual({
			children: testCase.expectedTypeChildren,
			stored: testCase.expectedTypeChildren.length,
		})
	}
	return { assertOn: 'source' }
}

// A type nothing names any more goes at the commit, with what only it named: whoever wrote.
describe('the commit removes the types a transaction left unused', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the only LNode naming T deleted → T, its DOType, DAType and EnumTypes go, another type stays':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-t': 'T', 'lnode-s': 'S' },
					types: [CHAIN_T, TYPE_S],
				}),
				write: deleteLNodeT,
				expectedQueries: ['//default:LNodeType[@id="S"]', '//default:DOType[@id="DS"]'],
				unexpectedQueries: CHAIN_T_PRESENT,
			},
		'the LNode deleted, another LNode names T → everything stays (a witness type goes)': {
			sourceXml: documentXml({
				functionLNodes: { 'lnode-t': 'T', 'lnode-other': 'T', 'lnode-w': 'W' },
				types: [CHAIN_T, TYPE_W],
			}),
			write: withTheWitnessDeleted(deleteLNodeT),
			expectedQueries: CHAIN_T_PRESENT,
			unexpectedQueries: WITNESS_GONE,
		},
		'the LNode deleted, an IED LN names T → everything stays (a witness type goes)': {
			sourceXml: documentXml({
				functionLNodes: { 'lnode-t': 'T', 'lnode-w': 'W' },
				ied: { ln0Type: 'LLN0_T', lns: { 'ln-t': 'T' } },
				types: [CHAIN_T, TYPE_LLN0, TYPE_W],
			}),
			write: withTheWitnessDeleted(deleteLNodeT),
			expectedQueries: CHAIN_T_PRESENT,
			unexpectedQueries: WITNESS_GONE,
		},
		'an LNode moved to another type by an update (lnType T → U) → T goes, U stays': {
			sourceXml: documentXml({
				functionLNodes: { 'lnode-t': 'T', 'lnode-s': 'S' },
				types: [CHAIN_T, TYPE_S, TYPE_U],
			}),
			write: async function pointToU(tx) {
				await tx.update(LNODE_T, { attributes: { lnType: 'U' } })
			},
			expectedQueries: ['//default:LNodeType[@id="U"]', '//default:DOType[@id="DU"]'],
			unexpectedQueries: CHAIN_T_PRESENT,
		},
		'a type U unused before the transaction, the LNode of T deleted → T goes, U and what U names stay':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-t': 'T' },
					types: [CHAIN_T, TYPE_U],
				}),
				write: deleteLNodeT,
				expectedQueries: ['//default:LNodeType[@id="U"]', '//default:DOType[@id="DU"]'],
				unexpectedQueries: CHAIN_T_PRESENT,
			},
		'the last LNode naming T deleted, an LNode naming T created in the same transaction → T stays (a witness type goes)':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-t': 'T', 'lnode-w': 'W' },
					types: [CHAIN_T, TYPE_W],
				}),
				write: withTheWitnessDeleted(async function replaceTheLNode(tx) {
					await tx.delete(LNODE_T)
					await tx.addChild(FUNCTION, {
						tagName: 'LNode',
						attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '9', lnType: 'T' },
					})
				}),
				expectedQueries: CHAIN_T_PRESENT,
				unexpectedQueries: WITNESS_GONE,
			},
		'an LNode moved to U then back to T in one transaction → T stays (a witness type goes)': {
			sourceXml: documentXml({
				functionLNodes: { 'lnode-t': 'T', 'lnode-w': 'W' },
				types: [CHAIN_T, TYPE_W],
			}),
			write: withTheWitnessDeleted(async function awayAndBack(tx) {
				await tx.update(LNODE_T, { attributes: { lnType: 'U' } })
				await tx.update(LNODE_T, { attributes: { lnType: 'T' } })
			}),
			expectedQueries: CHAIN_T_PRESENT,
			unexpectedQueries: WITNESS_GONE,
		},
		'an LNode created naming a type unused before, then deleted → the type stays (a witness type goes)':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-s': 'S', 'lnode-w': 'W' },
					types: [TYPE_S, TYPE_U, TYPE_W],
				}),
				write: withTheWitnessDeleted(async function createThenDelete(tx) {
					const lnode = await tx.addChild(FUNCTION, {
						tagName: 'LNode',
						attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '9', lnType: 'U' },
					})
					await tx.delete(lnode)
				}),
				expectedQueries: ['//default:LNodeType[@id="U"]', '//default:DOType[@id="DU"]'],
				unexpectedQueries: WITNESS_GONE,
			},
		'a type created by the transaction and left unreferenced → stays (a witness type goes)': {
			sourceXml: documentXml({
				functionLNodes: { 'lnode-s': 'S', 'lnode-w': 'W' },
				types: [TYPE_S, TYPE_W],
			}),
			write: withTheWitnessDeleted(async function createAnUnusedType(tx) {
				await tx.addChild(DATA_TYPE_TEMPLATES, {
					tagName: 'DOType',
					attributes: { id: 'DN', cdc: 'SPS' },
				})
			}),
			expectedQueries: ['//default:DOType[@id="DN"]'],
			unexpectedQueries: WITNESS_GONE,
		},
		'an LNodeType deleted by hand → the types only it named go, an LNode naming it keeps its dangling lnType':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-t': 'T', 'lnode-s': 'S' },
					types: [CHAIN_T, TYPE_S],
				}),
				write: async function deleteTheType(tx) {
					await tx.delete({ tagName: 'LNodeType', id: 'lnt-T' })
				},
				expectedQueries: ['//default:LNode[@lnType="T"]', '//default:LNodeType[@id="S"]'],
				unexpectedQueries: [
					'//default:DOType[@id="D"]',
					'//default:DAType[@id="A"]',
					'//default:EnumType[@id="E"]',
					'//default:EnumType[@id="E2"]',
				],
			},
		'a Bay holding two LNodes deleted → both their types go with what they named, a type still named stays':
			{
				sourceXml: documentXml({
					bayLNodes: { 'bay-lnode-t': 'T', 'bay-lnode-s': 'S' },
					functionLNodes: { 'lnode-u': 'U' },
					types: [CHAIN_T, TYPE_S, TYPE_U],
				}),
				write: async function deleteTheBay(tx) {
					await tx.delete(BAY)
				},
				expectedQueries: ['//default:LNodeType[@id="U"]', '//default:DOType[@id="DU"]'],
				unexpectedQueries: [
					...CHAIN_T_PRESENT,
					'//default:LNodeType[@id="S"]',
					'//default:DOType[@id="DS"]',
				],
			},
		'an IED deleted (LN0 and LNs) → its types go, the type an LNode of the substation still names stays':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-s': 'S' },
					ied: { ln0Type: 'LLN0_T', lns: { 'ln-t': 'T', 'ln-s': 'S' } },
					types: [CHAIN_T, TYPE_S, TYPE_LLN0],
				}),
				write: async function deleteTheIed(tx) {
					await tx.delete(IED)
				},
				expectedQueries: ['//default:LNodeType[@id="S"]', '//default:DOType[@id="DS"]'],
				unexpectedQueries: [
					...CHAIN_T_PRESENT,
					'//default:LNodeType[@id="LLN0_T"]',
					'//default:DOType[@id="DL"]',
				],
			},
		'the IED LN of T deleted, a substation LNode bound to that LN still names T → T stays (a witness type goes)':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-bound': 'T', 'lnode-w': 'W' },
					ied: { ln0Type: 'LLN0_T', lns: { 'ln-t': 'T' } },
					types: [CHAIN_T, TYPE_LLN0, TYPE_W],
				}).replace(
					'iedName="None" lnClass="XCBR" lnInst="1" lnType="T"',
					'iedName="IED1" ldInst="LD0" lnClass="XCBR" lnInst="1" lnType="T"',
				),
				write: withTheWitnessDeleted(async function deleteTheIedLn(tx) {
					await tx.delete({ tagName: 'LN', id: 'ln-t' })
				}),
				expectedQueries: ['//default:LNode[@iedName="IED1"][@lnType="T"]', ...CHAIN_T_PRESENT],
				unexpectedQueries: WITNESS_GONE,
			},
		'the last types of DataTypeTemplates pruned → DataTypeTemplates goes in the same commit': {
			sourceXml: documentXml({ functionLNodes: { 'lnode-t': 'T' }, types: [CHAIN_T] }),
			write: deleteLNodeT,
			unexpectedQueries: ['//default:DataTypeTemplates', ...CHAIN_T_PRESENT],
			removed: [DATA_TYPE_TEMPLATES],
		},
		'one type left in DataTypeTemplates → it stays and lists only the types that remain, each a record of the store':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-t': 'T', 'lnode-s': 'S' },
					types: [CHAIN_T, TYPE_S],
				}),
				write: deleteLNodeT,
				expectedQueries: ['//default:DataTypeTemplates/default:LNodeType[@id="S"]'],
				unexpectedQueries: CHAIN_T_PRESENT,
				expectedTypeChildren: ['dot-DS', 'lnt-S'],
			},
		'a pruned type leaves no record in the store: its DO, DA, Val, BDA and EnumVal go, not only the exported tree':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-t': 'T', 'lnode-s': 'S' },
					types: [CHAIN_T, TYPE_S],
				}),
				write: deleteLNodeT,
				removed: CHAIN_T_RECORDS,
			},
		'a pruned type holding a Private with a foreign element → the Private and its content leave the store too':
			{
				sourceXml: documentXml({
					functionLNodes: { 'lnode-t': 'T', 'lnode-s': 'S' },
					types: [CHAIN_T_WITH_PRIVATE, TYPE_S],
				}),
				write: deleteLNodeT,
				removed: [
					{ tagName: 'Private', id: 'private-T' },
					{ tagName: 'Note', id: 'note-T' },
					{ tagName: 'Private', id: 'private-D' },
					{ tagName: 'Note', id: 'note-D' },
					{ tagName: 'LNodeType', id: 'lnt-T' },
					{ tagName: 'DOType', id: 'dot-D' },
				] as Scl.Ref<Scl.ElementsOf>[],
				unexpectedQueries: ['//default:LNodeType[@id="T"]', '//default:DOType[@id="D"]'],
			},
	}

	runSclTestCases.withExport({ testCases, act: writeThenRead })
})

// document.prepare runs the commit pass: a preview shows the prune, and nothing is committed.
describe('a prepared transaction shows the types it prunes', () => {
	runSclTestCases.withoutExport({
		testCases: {
			'a delete of the last LNode naming T → the prepared query no longer reads T, the store still does':
				{
					sourceXml: documentXml({
						functionLNodes: { 'lnode-t': 'T', 'lnode-s': 'S' },
						types: [CHAIN_T, TYPE_S],
					}),
				},
		},
		act: async ({ source }) => {
			const prepared = await source.prepare(deleteLNodeT)
			const preview = await prepared.query.getRecord({ tagName: 'LNodeType', id: 'lnt-T' })
			prepared.discard()
			const stored = await source.query.getRecord({ tagName: 'LNodeType', id: 'lnt-T' })
			expect({ previewed: preview !== undefined, stored: stored !== undefined }).toEqual({
				previewed: false,
				stored: true,
			})
		},
	})
})

// ── the hook alone: the operations it stages, and the reads it makes ─────────────────────────────────

function lnodeRecord(params: { lnType: string; desc?: string }): Scl.RawRecord<Scl.ElementsOf> {
	const { lnType, desc } = params
	return createSclTestRecord({
		record: {
			tagName: 'LNode',
			id: 'lnode-t',
			parent: FUNCTION,
			attributes: {
				iedName: 'None',
				lnClass: 'XCBR',
				lnInst: '1',
				lnType,
				...(desc === undefined ? {} : { desc }),
			},
		},
	})
}

function bayRecord(): Scl.RawRecord<Scl.ElementsOf> {
	return createSclTestRecord({
		record: {
			tagName: 'Bay',
			id: 'bay',
			parent: { tagName: 'VoltageLevel', id: 'voltage-level' },
			attributes: { name: 'B1' },
		},
	})
}

type HookCase = SclTest.BaseXmlTestCase & {
	/** The operations the transaction staged. */
	operations: Scl.Operation[]
	/** The ids of the records the hook deletes, sorted. */
	expectedDeleted: string[]
	/** The records the hook updates, each with the ids it lists as children, sorted. */
	expectedUpdated: { id: string; children: string[] }[]
	/** The methods called on the query, in order. */
	expectedReads?: string[]
}

const CHAIN_T_RECORD_IDS = CHAIN_T_RECORDS.map((record) => record.id).sort()

describe('pruneUnusedTypes', () => {
	const afterTheDelete = documentXml({
		functionLNodes: { 'lnode-s': 'S' },
		types: [CHAIN_T, TYPE_S],
	})

	const testCases: SclTest.TestCases<HookCase> = {
		'the only LNode naming T deleted → one deleted operation per record of T, D, A, E and E2, and one update of DataTypeTemplates without them':
			{
				sourceXml: afterTheDelete,
				operations: [
					{ status: 'deleted', oldRecord: lnodeRecord({ lnType: 'T' }), newRecord: undefined },
				],
				expectedDeleted: CHAIN_T_RECORD_IDS,
				expectedUpdated: [{ id: 'dtt', children: ['dot-DS', 'lnt-S'] }],
			},
		'a Bay deleted, no tag of the transaction names a type → no operation, no read': {
			sourceXml: afterTheDelete,
			operations: [{ status: 'deleted', oldRecord: bayRecord(), newRecord: undefined }],
			expectedDeleted: [],
			expectedUpdated: [],
			expectedReads: [],
		},
		'an LNode created naming T, nothing lost → no operation, no read': {
			sourceXml: afterTheDelete,
			operations: [
				{ status: 'created', oldRecord: undefined, newRecord: lnodeRecord({ lnType: 'T' }) },
			],
			expectedDeleted: [],
			expectedUpdated: [],
			expectedReads: [],
		},
		'an LNode updated on another attribute than lnType → no operation, no read': {
			sourceXml: afterTheDelete,
			operations: [
				{
					status: 'updated',
					oldRecord: lnodeRecord({ lnType: 'T' }),
					newRecord: lnodeRecord({ lnType: 'T', desc: 'renamed' }),
				},
			],
			expectedDeleted: [],
			expectedUpdated: [],
			expectedReads: [],
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const { query, reads } = countQueryReads(source.query)
			await expect(
				pruneUnusedTypes({ operations: testCase.operations, query }).then((staged) => ({
					deleted: staged
						.filter((operation) => operation.status === 'deleted')
						.map((operation) => operation.oldRecord.id)
						.sort(),
					updated: staged.flatMap((operation) =>
						operation.status === 'updated'
							? [
									{
										id: operation.newRecord.id,
										children: operation.newRecord.children.map((child) => child.id).sort(),
									},
								]
							: [],
					),
					...(testCase.expectedReads ? { reads } : {}),
				})),
			).resolves.toEqual({
				deleted: testCase.expectedDeleted,
				updated: testCase.expectedUpdated,
				...(testCase.expectedReads ? { reads: testCase.expectedReads } : {}),
			})
		},
	})
})
