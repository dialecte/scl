import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	assertExpectedElementQueries,
	assertUnexpectedElementQueries,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'
import { storedAmong } from '@/v2019C1/test/stored-among'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

function at(recordId: string): string {
	return `${id}="${recordId}"`
}

/** An LNodeType `typeId` whose one data object `Beh` names the DOType `doTypeId`. */
function lnodeType(params: { typeId: string; doTypeId: string }): string {
	const { typeId, doTypeId } = params
	return `<LNodeType id="${typeId}" lnClass="XCBR" ${at(`lnt-${typeId}`)}><DO name="Beh" type="${doTypeId}" ${at(`do-${typeId}`)}/></LNodeType>`
}

/** A DOType `typeId`, holding a data attribute of bType Enum naming `enumTypeId` when given. */
function doType(params: { typeId: string; enumTypeId?: string }): string {
	const { typeId, enumTypeId } = params
	const members =
		enumTypeId === undefined
			? ''
			: `<DA name="stVal" fc="ST" bType="Enum" type="${enumTypeId}" ${at(`da-${typeId}`)}/>`
	return `<DOType id="${typeId}" cdc="SPS" ${at(`dot-${typeId}`)}>${members}</DOType>`
}

function enumType(typeId: string): string {
	return `<EnumType id="${typeId}" ${at(`et-${typeId}`)}><EnumVal ord="0" ${at(`ev-${typeId}`)}>off</EnumVal></EnumType>`
}

/** The document: an LNode naming `lnType` when given, and the data type templates as the parts list them. */
function documentXml(params: {
	lnType?: string
	lnodeTypes: string[]
	doTypes: string[]
	enumTypes?: string[]
}): string {
	const { lnType, lnodeTypes, doTypes, enumTypes = [] } = params
	const lnode =
		lnType === undefined
			? ''
			: `<LNode iedName="None" lnClass="XCBR" lnInst="1" lnType="${lnType}" ${at('lnode')}/>`
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="substation">
				<VoltageLevel name="V1" ${id}="voltage-level"><Bay name="B1" ${id}="bay"/></VoltageLevel>
				<Function name="F1" ${id}="function">${lnode}</Function>
			</Substation>
			<DataTypeTemplates ${id}="dtt">
				${[...lnodeTypes, ...doTypes, ...enumTypes].join('\n')}
			</DataTypeTemplates>
		</SCL>
	`
}

const DATA_TYPE_TEMPLATES = { tagName: 'DataTypeTemplates', id: 'dtt' } as const

/** The type X nothing names, the DOType DX only it names, and the EnumType EX only DX names. */
const UNUSED_X = {
	lnodeTypes: [lnodeType({ typeId: 'X', doTypeId: 'DX' })],
	doTypes: [doType({ typeId: 'DX', enumTypeId: 'EX' })],
	enumTypes: [enumType('EX')],
}

/** The type T the LNode of the document names, with its DOType DT. */
const NAMED_T = {
	lnodeTypes: [lnodeType({ typeId: 'T', doTypeId: 'DT' })],
	doTypes: [doType({ typeId: 'DT' })],
}

const X_CHAIN_GONE = [
	'//default:LNodeType[@id="X"]',
	'//default:DOType[@id="DX"]',
	'//default:EnumType[@id="EX"]',
]
const T_CHAIN_PRESENT = ['//default:LNodeType[@id="T"]', '//default:DOType[@id="DT"]']

type TestCase = SclTest.BaseXmlTestCase & {
	/** Run the explicit sweep in a transaction; left out, the document is only imported. */
	sweep?: boolean
	/** The records that must be out of the store after the sweep, not only out of the exported tree. */
	removed?: readonly Scl.Ref<Scl.ElementsOf>[]
}

async function sweepThenRead({
	testCase,
	source,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	if (testCase.sweep) {
		await expect(
			source.transaction(async function sweepTheTypes(tx) {
				await tx.cleanUp.pruneUnusedTypes()
			}),
		).resolves.toBeUndefined()
	}
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
	return { assertOn: 'source' }
}

// The commit prune judges what a transaction left unused; the sweep is the explicit tidy of a whole document.
describe('pruneUnusedTypes', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'an LNodeType nothing names and the DOType only it names → both gone, the EnumType below them too':
			{
				sourceXml: documentXml({
					lnType: 'T',
					lnodeTypes: [...NAMED_T.lnodeTypes, ...UNUSED_X.lnodeTypes],
					doTypes: [...NAMED_T.doTypes, ...UNUSED_X.doTypes],
					enumTypes: UNUSED_X.enumTypes,
				}),
				sweep: true,
				expectedQueries: T_CHAIN_PRESENT,
				unexpectedQueries: X_CHAIN_GONE,
			},
		'an EnumType nothing names → gone': {
			sourceXml: documentXml({
				lnType: 'T',
				...NAMED_T,
				enumTypes: [enumType('EZ')],
			}),
			sweep: true,
			expectedQueries: T_CHAIN_PRESENT,
			unexpectedQueries: ['//default:EnumType[@id="EZ"]'],
		},
		'a type an LNode names stays with what it names, beside an unused one that goes': {
			sourceXml: documentXml({
				lnType: 'T',
				lnodeTypes: [...NAMED_T.lnodeTypes, ...UNUSED_X.lnodeTypes],
				doTypes: [...NAMED_T.doTypes, ...UNUSED_X.doTypes],
				enumTypes: UNUSED_X.enumTypes,
			}),
			sweep: true,
			expectedQueries: [
				'//default:LNodeType[@id="T"]/default:DO[@type="DT"]',
				'//default:DOType[@id="DT"]',
			],
			unexpectedQueries: ['//default:LNodeType[@id="X"]'],
		},
		'every record of a swept type leaves the store, not only the exported tree': {
			sourceXml: documentXml({
				lnType: 'T',
				lnodeTypes: [...NAMED_T.lnodeTypes, ...UNUSED_X.lnodeTypes],
				doTypes: [...NAMED_T.doTypes, ...UNUSED_X.doTypes],
				enumTypes: UNUSED_X.enumTypes,
			}),
			sweep: true,
			removed: [
				{ tagName: 'LNodeType', id: 'lnt-X' },
				{ tagName: 'DO', id: 'do-X' },
				{ tagName: 'DOType', id: 'dot-DX' },
				{ tagName: 'DA', id: 'da-DX' },
				{ tagName: 'EnumType', id: 'et-EX' },
				{ tagName: 'EnumVal', id: 'ev-EX' },
			],
		},
		'every type of the document unused → all gone, and the DataTypeTemplates they emptied goes at the commit':
			{
				sourceXml: documentXml({ ...UNUSED_X }),
				sweep: true,
				unexpectedQueries: ['//default:DataTypeTemplates', ...X_CHAIN_GONE],
				removed: [DATA_TYPE_TEMPLATES],
			},
		'a file imported with types nothing names → it keeps them, the sweep is a call': {
			sourceXml: documentXml({
				lnType: 'T',
				lnodeTypes: [...NAMED_T.lnodeTypes, ...UNUSED_X.lnodeTypes],
				doTypes: [...NAMED_T.doTypes, ...UNUSED_X.doTypes],
				enumTypes: UNUSED_X.enumTypes,
			}),
			expectedQueries: [
				...T_CHAIN_PRESENT,
				'//default:LNodeType[@id="X"]',
				'//default:DOType[@id="DX"]',
				'//default:EnumType[@id="EX"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: sweepThenRead })
})
