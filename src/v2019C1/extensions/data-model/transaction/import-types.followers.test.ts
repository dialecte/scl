import { importTypes } from './import-types'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { ImportTypesStats } from './import-types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

// An element of the target matched to an element of the source (an instance following a newer template) takes the type
// its source element names, through the closure: an equal type is reused, a free id kept, a taken one forked. The type
// it leaves goes when nothing names it any more, and a fork takes back the id that frees.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A follower: the source logical node (record id) and the target's logical node following it. */
type Follower = { source: string; target: Scl.Ref<'LNode'> | Scl.Ref<'LN'> }

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** One `importTypes` call per entry, in one transaction, each with its followers. */
	calls: Follower[][]
	/** Asserted against the stats of the last call. */
	expectedStats?: Partial<ImportTypesStats>
	/** On a dedup, which side keeps the type name. Default: the target. */
	keepNameTypesFrom?: 'source' | 'target'
	/** The source type id -> target type id the last call returns, as entries sorted by source id. */
	expectedRemap?: [string, string][]
	/** Between the calls, the target's elements of these record ids are deleted (in order). */
	deletedBetweenCalls?: Scl.Ref<Scl.ElementsOf>[]
}

/** The source: the logical node `lnode-s` naming `T`, of `typeContent`, and the types it holds besides. */
function sourceXml(params: { typeContent: string; otherTypes?: string }): string {
	const { typeContent, otherTypes = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="scl-s">
			<Substation name="S1" ${id}="sub-s">
				<VoltageLevel name="V1" ${id}="vl-s">
					<Bay name="B1" ${id}="bay-s">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="T" ${id}="lnode-s"/>
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-s">
				<LNodeType id="T" lnClass="CSWI" ${id}="lnt-s">
					${typeContent}
				</LNodeType>
				<DOType id="DPC" cdc="DPC" ${id}="dot-s">
					<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
				</DOType>
				${otherTypes}
			</DataTypeTemplates>
		</SCL>
	`
}

/** The target: the bay holding `lnodes`, `beside` next to the substation, and its `types`. */
function targetXml(params: { lnodes: string; types: string; beside?: string }): string {
	const { lnodes, types, beside = '' } = params
	return /* xml */ `
		<SCL ${ns} ${id}="scl-t">
			${beside}
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t">
					<Bay name="B1" ${id}="bay-t">
						${lnodes}
					</Bay>
				</VoltageLevel>
			</Substation>
			<DataTypeTemplates ${id}="dtt-t">
				${types}
			</DataTypeTemplates>
		</SCL>
	`
}

const position = `<DO name="Pos" type="DPC" ${id}="do-pos-s"/>`
const positionAndBlock = `${position}<DO name="BlkOpn" type="DPC" ${id}="do-blk-s"/>`
const positionType = /* xml */ `
	<DOType id="DPC" cdc="DPC" ${id}="dot-t">
		<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
	</DOType>
`

/** The target's logical node `record` naming `lnType`. */
function lnode(params: { record: string; lnType: string; inst?: string }): string {
	const { record, lnType, inst = '1' } = params
	return `<LNode iedName="None" lnClass="CSWI" lnInst="${inst}" lnType="${lnType}" ${id}="${record}"/>`
}

/** The target's type `typeId` holding the position only, its data object of `doType`. */
function positionOnly(params: { typeId: string; doType?: string; record?: string }): string {
	const { typeId, doType = 'DPC', record = 'lnt-t' } = params
	return /* xml */ `
		<LNodeType id="${typeId}" lnClass="CSWI" ${id}="${record}">
			<DO name="Pos" type="${doType}" ${id}="${record}-do"/>
		</LNodeType>
	`
}

/** The target's logical node `target` following the source's. */
function follows(target: string): Follower {
	return { source: 'lnode-s', target: { tagName: 'LNode', id: target } as Scl.Ref<'LNode'> }
}

describe('importTypes — elements following the type their source names', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'source type equal to the one the follower names under another id -> the follower stays on it':
			{
				sourceXml: sourceXml({ typeContent: position }),
				targetXml: targetXml({
					lnodes: lnode({ record: 'follower', lnType: 'Mine' }),
					types: `${positionOnly({ typeId: 'Mine' })}${positionType}`,
				}),
				calls: [[follows('follower')]],
				expectedStats: { reused: 2, preserved: 0, forked: 0 },
				expectedQueries: ['//default:LNode[@lnType="Mine"]', '//default:LNodeType[@id="Mine"]'],
				unexpectedQueries: ['//default:LNodeType[@id="T"]'],
			},

		'source type gaining a data object under the same id, nothing else naming it -> updated in place':
			{
				sourceXml: sourceXml({ typeContent: positionAndBlock }),
				targetXml: targetXml({
					lnodes: lnode({ record: 'follower', lnType: 'T' }),
					types: `${positionOnly({ typeId: 'T' })}${positionType}`,
				}),
				calls: [[follows('follower')]],
				expectedStats: { forked: 1, reclaimed: 1 },
				expectedQueries: [
					'//default:LNode[@lnType="T"]',
					'//default:LNodeType[@id="T"]/default:DO[@name="BlkOpn"]',
				],
				unexpectedQueries: [
					'//default:LNodeType[2]',
					'//default:LNodeType[starts-with(@id, "PRJ_")]',
				],
			},

		'source type gaining a data object, a logical node of an IED naming it too -> the follower on a fork, the type left as it is':
			{
				sourceXml: sourceXml({ typeContent: positionAndBlock }),
				targetXml: targetXml({
					lnodes: lnode({ record: 'follower', lnType: 'T' }),
					types: `${positionOnly({ typeId: 'T' })}${positionType}`,
					beside: /* xml */ `
						<IED name="D1" ${id}="ied-t">
							<AccessPoint name="AP1" ${id}="ap-t">
								<Server ${id}="srv-t">
									<LDevice inst="LD1" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="T" ${id}="ln0-t"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					`,
				}),
				calls: [[follows('follower')]],
				expectedStats: { forked: 1, reclaimed: 0 },
				expectedQueries: [
					'//default:LN0[@lnType="T"]',
					'//default:LNodeType[@id="T"][not(default:DO[@name="BlkOpn"])]',
					'//default:LNode[starts-with(@lnType, "PRJ_T_")]',
					'//default:LNodeType[starts-with(@id, "PRJ_T_")]/default:DO[@name="BlkOpn"]',
				],
			},

		'follower leaving a type of its own id that nothing else names -> that type and the types only it names removed':
			{
				sourceXml: sourceXml({ typeContent: positionAndBlock }),
				targetXml: targetXml({
					lnodes: lnode({ record: 'follower', lnType: 'Mine' }),
					types: /* xml */ `
						${positionOnly({ typeId: 'Mine', doType: 'MineDPC' })}
						<DOType id="MineDPC" cdc="DPC" ${id}="dot-mine">
							<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-mine"/>
							<DA name="q" bType="Quality" fc="ST" ${id}="da-mine-q"/>
						</DOType>
					`,
				}),
				calls: [[follows('follower')]],
				expectedStats: { preserved: 2 },
				expectedQueries: [
					'//default:LNode[@lnType="T"]',
					'//default:LNodeType[@id="T"]/default:DO[@name="BlkOpn"]',
				],
				unexpectedQueries: ['//default:LNodeType[@id="Mine"]', '//default:DOType[@id="MineDPC"]'],
			},

		'follower leaving a type another logical node names -> that type kept': {
			sourceXml: sourceXml({ typeContent: positionAndBlock }),
			targetXml: targetXml({
				lnodes: `${lnode({ record: 'follower', lnType: 'Mine' })}${lnode({ record: 'own', lnType: 'Mine', inst: '2' })}`,
				types: `${positionOnly({ typeId: 'Mine' })}${positionType}`,
			}),
			calls: [[follows('follower')]],
			expectedQueries: [
				'//default:LNode[@lnInst="1"][@lnType="T"]',
				'//default:LNode[@lnInst="2"][@lnType="Mine"]',
				'//default:LNodeType[@id="Mine"]',
			],
		},

		'two followers of one type, one call each -> both on the new content under the type id, no fork left':
			{
				sourceXml: sourceXml({ typeContent: positionAndBlock }),
				targetXml: targetXml({
					lnodes: `${lnode({ record: 'first', lnType: 'T' })}${lnode({ record: 'second', lnType: 'T', inst: '2' })}`,
					types: `${positionOnly({ typeId: 'T' })}${positionType}`,
				}),
				calls: [[follows('first')], [follows('second')]],
				expectedStats: { reused: 2, reclaimed: 1 },
				expectedRemap: [
					['DPC', 'DPC'],
					['T', 'T'],
				],
				expectedQueries: [
					'//default:LNode[@lnInst="1"][@lnType="T"]',
					'//default:LNode[@lnInst="2"][@lnType="T"]',
					'//default:LNodeType[@id="T"]/default:DO[@name="BlkOpn"]',
				],
				unexpectedQueries: [
					'//default:LNodeType[2]',
					'//default:LNodeType[starts-with(@id, "PRJ_")]',
				],
			},

		'two followers of one type in two calls, a logical node of an IED naming it too -> both on one fork, the type left as it is':
			{
				sourceXml: sourceXml({ typeContent: positionAndBlock }),
				targetXml: targetXml({
					lnodes: `${lnode({ record: 'first', lnType: 'T' })}${lnode({ record: 'second', lnType: 'T', inst: '2' })}`,
					types: `${positionOnly({ typeId: 'T' })}${positionType}`,
					beside: /* xml */ `
						<IED name="D1" ${id}="ied-t">
							<AccessPoint name="AP1" ${id}="ap-t">
								<Server ${id}="srv-t">
									<LDevice inst="LD1" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="T" ${id}="ln0-t"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					`,
				}),
				calls: [[follows('first')], [follows('second')]],
				expectedStats: { reused: 2, reclaimed: 0 },
				expectedQueries: [
					'//default:LNode[@lnInst="1"][starts-with(@lnType, "PRJ_T_")]',
					'//default:LNode[@lnInst="2"][@lnType = //default:LNode[@lnInst="1"]/@lnType]',
					'//default:LN0[@lnType="T"]',
					'//default:LNodeType[@id="T"][not(default:DO[@name="BlkOpn"])]',
				],
				unexpectedQueries: ['//default:LNodeType[3]'],
			},

		'names taken from the source, the follower on an equal type of its own id -> that type renamed to the source id, the follower with it':
			{
				sourceXml: sourceXml({ typeContent: position }),
				targetXml: targetXml({
					lnodes: lnode({ record: 'follower', lnType: 'Mine' }),
					types: `${positionOnly({ typeId: 'Mine' })}${positionType}`,
				}),
				calls: [[follows('follower')]],
				keepNameTypesFrom: 'source',
				expectedStats: { reused: 2 },
				expectedQueries: ['//default:LNode[@lnType="T"]', '//default:LNodeType[@id="T"]'],
				unexpectedQueries: ['//default:LNodeType[@id="Mine"]', '//default:LNodeType[2]'],
			},

		'source naming no type -> the follower names none, the type it left removed': {
			sourceXml: sourceXml({ typeContent: position }).replace(' lnType="T"', ''),
			targetXml: targetXml({
				lnodes: lnode({ record: 'follower', lnType: 'T' }),
				types: `${positionOnly({ typeId: 'T' })}${positionType}`,
			}),
			calls: [[follows('follower')]],
			expectedQueries: ['//default:LNode[not(@lnType)]'],
			unexpectedQueries: ['//default:LNodeType', '//default:DOType'],
		},

		'a follower naming no type, the source naming one -> the follower on it, a type nothing names left as it is':
			{
				sourceXml: sourceXml({ typeContent: positionAndBlock }),
				targetXml: targetXml({
					lnodes: `<LNode iedName="None" lnClass="CSWI" lnInst="1" ${id}="follower"/>`,
					types: `${positionOnly({ typeId: 'Spare', record: 'lnt-spare' })}${positionType}`,
				}),
				calls: [[follows('follower')]],
				expectedQueries: ['//default:LNode[@lnType="T"]', '//default:LNodeType[@id="Spare"]'],
			},

		'a fork the target holds whose source id is free, a call with no follower -> the fork left under its id':
			{
				sourceXml: sourceXml({ typeContent: positionAndBlock }),
				targetXml: targetXml({
					lnodes: lnode({ record: 'first', lnType: 'T' }),
					types: `${positionOnly({ typeId: 'T' })}${positionType}`,
					beside: /* xml */ `
						<IED name="D1" ${id}="ied-t">
							<AccessPoint name="AP1" ${id}="ap-t">
								<Server ${id}="srv-t">
									<LDevice inst="LD1" ${id}="ld-t">
										<LN0 lnClass="LLN0" inst="" lnType="T" ${id}="ln0-t"/>
									</LDevice>
								</Server>
							</AccessPoint>
						</IED>
					`,
				}),
				// the first call forks for the follower, the device and its type then go: the second has nothing to follow
				calls: [[follows('first')], []],
				deletedBetweenCalls: [
					{ tagName: 'IED', id: 'ied-t' } as Scl.Ref<'IED'>,
					{ tagName: 'LNodeType', id: 'lnt-t' } as Scl.Ref<'LNodeType'>,
				],
				expectedQueries: ['//default:LNode[starts-with(@lnType, "PRJ_T_")]'],
				unexpectedQueries: ['//default:LNodeType[@id="T"]'],
			},

		'a follower already on the type its source names -> nothing written': {
			sourceXml: sourceXml({ typeContent: position }),
			targetXml: targetXml({
				lnodes: lnode({ record: 'follower', lnType: 'T' }),
				types: `${positionOnly({ typeId: 'T' })}${positionType}`,
			}),
			calls: [[follows('follower')]],
			expectedStats: { reused: 2, preserved: 0, forked: 0, reclaimed: 0 },
			expectedQueries: ['//default:LNode[@lnType="T"]', '//default:LNodeType[@id="T"]'],
			unexpectedQueries: ['//default:LNodeType[2]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const sourceQuery = source.query
		let stats: ImportTypesStats | undefined
		let remap: Map<string, string> | undefined
		await target.transaction(async function importForEachCall(tx) {
			for (const [index, call] of testCase.calls.entries()) {
				if (index > 0) {
					for (const element of testCase.deletedBetweenCalls ?? []) await tx.delete(element)
				}
				const followers = []
				for (const follower of call) {
					const record = await sourceQuery.getRecord({ tagName: 'LNode', id: follower.source })
					if (!record) throw new Error(`source logical node ${follower.source} not found`)
					followers.push({ source: record, target: follower.target })
				}
				const result = await importTypes(tx, {
					sourceQuery,
					// a call with no follower brings the source's closure as a placement does
					records: call.length > 0 ? [] : [await sourceLogicalNode(sourceQuery)],
					followers,
					forkPrefix: 'PRJ_',
					keepNameTypesFrom: testCase.keepNameTypesFrom,
				})
				stats = result.stats
				remap = result.idRemap
			}
		})
		if (testCase.expectedStats) expect(stats).toMatchObject(testCase.expectedStats)
		if (testCase.expectedRemap) {
			expect([...(remap ?? [])].sort(([a], [b]) => a.localeCompare(b))).toEqual(
				testCase.expectedRemap,
			)
		}
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The source's logical node. */
async function sourceLogicalNode(sourceQuery: Scl.Query): Promise<Scl.TrackedRecord<'LNode'>> {
	const record = await sourceQuery.getRecord({ tagName: 'LNode', id: 'lnode-s' })
	if (!record) throw new Error('source logical node lnode-s not found')
	return record
}
