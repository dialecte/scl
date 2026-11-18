import { buildCascadeOperations, collectDeleteCascade, findOrphanedRefs } from './orphaned-refs'

import { toRawRecord, widen } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { REFERENCE_TAGS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { OrphanedRef } from './orphaned-refs.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { CountedQueryCall } from '@/v2019C1/test/count-query-reads.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES
const PRIVATE_6_100 = 'eIEC61850-6-100'

/**
 * Function F1 holds a logical node; an IED's input names another; function F2's logical node holds four source
 * references: `sr-a` naming F1's node, `sr-b` naming the input, `sr-c` both, `sr-d` neither; a function category names F1.
 */
const referrersByUuidXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<Private type="${PRIVATE_6_100}" ${id}="category-private">
				<${PRIVATE_6_100}:FunctionCategory name="Cat1" ${id}="category">
					<${PRIVATE_6_100}:FunctionCatRef function="S1/F1" functionUuid="uuid-f1" ${id}="category-ref"/>
				</${PRIVATE_6_100}:FunctionCategory>
			</Private>
			<Function name="F1" uuid="uuid-f1" ${id}="f1">
				<LNode iedName="None" lnClass="XCBR" lnInst="1" uuid="uuid-l1" ${id}="l1"/>
			</Function>
			<Function name="F2" uuid="uuid-f2" ${id}="f2">
				<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="uuid-l2" ${id}="l2">
					<Private type="${PRIVATE_6_100}" ${id}="l2-private">
						<${PRIVATE_6_100}:LNodeInputs ${id}="l2-inputs">
							<${PRIVATE_6_100}:SourceRef input="A" source="S1/F1/XCBR1" sourceLNodeUuid="uuid-l1" ${id}="sr-a"/>
							<${PRIVATE_6_100}:SourceRef input="B" extRefAddr="P1/LD0/PTRC1/Trip" extRefUuid="uuid-ext1" ${id}="sr-b"/>
							<${PRIVATE_6_100}:SourceRef input="C" source="S1/F1/XCBR1" sourceLNodeUuid="uuid-l1" extRefAddr="P1/LD0/PTRC1/Trip" extRefUuid="uuid-ext1" ${id}="sr-c"/>
							<${PRIVATE_6_100}:SourceRef input="D" source="S1/F2/PTRC1" sourceLNodeUuid="uuid-l2" ${id}="sr-d"/>
						</${PRIVATE_6_100}:LNodeInputs>
					</Private>
				</LNode>
			</Function>
		</Substation>
		<IED name="P1" ${id}="p1">
			<AccessPoint name="AP1" ${id}="ap1">
				<Server ${id}="server">
					<Authentication ${id}="auth"/>
					<LDevice inst="LD0" ${id}="ld0">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0" ${id}="ln0">
							<Inputs ${id}="inputs">
								<ExtRef intAddr="Trip" uuid="uuid-ext1" ${id}="ext1"/>
							</Inputs>
						</LN0>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/** Thrown by a read-only transaction to roll it back. */
const ROLL_BACK = 'read only: rolled back'

const REFERRER_ROOTS: Scl.Ref<Scl.ElementsOf>[] = [
	{ tagName: 'Function', id: 'f1' },
	{ tagName: 'ExtRef', id: 'ext1' },
]

/** An orphaned reference as `<effect> <tag> <id> <attributes, sorted>`. */
function describeOrphaned(orphaned: OrphanedRef): string {
	const attributes = [...orphaned.attributes].filter((name) => name !== undefined).sort()
	return `${orphaned.effect} ${orphaned.record.tagName} ${orphaned.record.id} ${attributes.join(',')}`
}

/** The calls of a counted query, `getRecordsByTagName` with the tag it read, the other methods by name. */
function describeCalls(calls: readonly CountedQueryCall[]): string[] {
	return calls.map(({ method, args }) =>
		method === 'getRecordsByTagName' ? `${method} ${String(args[0])}` : method,
	)
}

describe('findOrphanedRefs reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** Source references deleted in the transaction before the read, by id, first. */
		deleted?: string[]
		/** Source references whose `input` the transaction changes before the read, by id, last. */
		updated?: string[]
		/** Source references created in the transaction before the read, in that order. */
		created?: {
			id: ReturnType<typeof crypto.randomUUID>
			attributes: {
				input: string
				source?: string
				sourceLNodeUuid?: string
				extRefAddr?: string
				extRefUuid?: string
			}
		}[]
		/** The orphaned references, as {@link describeOrphaned}. */
		expectedOrphaned: string[]
		/** The calls, as {@link describeCalls}: the subtree levels, the referrer lookups, then a tag read to order them. */
		expectedCalls: string[]
	}

	/** F1, its logical node, the node's Private and what it holds: the ExtRef holds nothing. */
	const subtreeLevels = ['getRecords', 'getRecords', 'getRecords']
	/** One value-list lookup per referrer tag and uuid attribute. */
	const lookups = REFERENCE_TAGS.flatMap((tagName) =>
		UUID_REFERENCE_PAIRS[tagName].map(() => 'findByAttributes'),
	)

	const testCases: SclTest.TestCases<TestCase> = {
		'a function and an input deleted → the same references as a whole tag read, in tag order, one lookup per referrer tag and uuid attribute, no referrer tag read whole':
			{
				sourceXml: referrersByUuidXml,
				expectedOrphaned: [
					'deleted FunctionCatRef category-ref function,functionUuid',
					'cleared SourceRef sr-a source,sourceDaName,sourceDoName,sourceLNodeUuid',
					'cleared SourceRef sr-b extRefAddr,extRefUuid',
					'cleared SourceRef sr-c extRefAddr,extRefUuid,source,sourceDaName,sourceDoName,sourceLNodeUuid',
				],
				expectedCalls: [...subtreeLevels, ...lookups],
			},
		'source references created in the transaction, naming the subtrees by two uuid attributes → after the stored ones, in the order created, the source references read whole once for that order':
			{
				sourceXml: referrersByUuidXml,
				created: [
					{
						id: 'ffffffff-0000-4000-8000-000000000001',
						attributes: { input: 'E', source: 'S1/F1/XCBR1', sourceLNodeUuid: 'uuid-l1' },
					},
					{
						id: '00000000-0000-4000-8000-000000000001',
						attributes: { input: 'F', extRefAddr: 'P1/LD0/PTRC1/Trip', extRefUuid: 'uuid-ext1' },
					},
				],
				expectedOrphaned: [
					'deleted FunctionCatRef category-ref function,functionUuid',
					'cleared SourceRef sr-a source,sourceDaName,sourceDoName,sourceLNodeUuid',
					'cleared SourceRef sr-b extRefAddr,extRefUuid',
					'cleared SourceRef sr-c extRefAddr,extRefUuid,source,sourceDaName,sourceDoName,sourceLNodeUuid',
					'cleared SourceRef ffffffff-0000-4000-8000-000000000001 source,sourceDaName,sourceDoName,sourceLNodeUuid',
					'cleared SourceRef 00000000-0000-4000-8000-000000000001 extRefAddr,extRefUuid',
				],
				expectedCalls: [...subtreeLevels, ...lookups, 'getRecordsByTagName SourceRef'],
			},
		'a stored source reference updated in the transaction, two uuid attributes answering → in id order as stored, the source references read whole once for that order':
			{
				sourceXml: referrersByUuidXml,
				updated: ['sr-b'],
				expectedOrphaned: [
					'deleted FunctionCatRef category-ref function,functionUuid',
					'cleared SourceRef sr-a source,sourceDaName,sourceDoName,sourceLNodeUuid',
					'cleared SourceRef sr-b extRefAddr,extRefUuid',
					'cleared SourceRef sr-c extRefAddr,extRefUuid,source,sourceDaName,sourceDoName,sourceLNodeUuid',
				],
				expectedCalls: [...subtreeLevels, ...lookups, 'getRecordsByTagName SourceRef'],
			},
		'a source reference deleted then created again in the transaction → after the others, as a tag read places it':
			{
				sourceXml: referrersByUuidXml,
				deleted: ['sr-a'],
				created: [
					{
						// the stored id written again: the fixture ids are not uuid-shaped
						id: 'sr-a' as ReturnType<typeof crypto.randomUUID>,
						attributes: { input: 'A', source: 'S1/F1/XCBR1', sourceLNodeUuid: 'uuid-l1' },
					},
				],
				expectedOrphaned: [
					'deleted FunctionCatRef category-ref function,functionUuid',
					'cleared SourceRef sr-b extRefAddr,extRefUuid',
					'cleared SourceRef sr-c extRefAddr,extRefUuid,source,sourceDaName,sourceDoName,sourceLNodeUuid',
					'cleared SourceRef sr-a source,sourceDaName,sourceDoName,sourceLNodeUuid',
				],
				expectedCalls: [...subtreeLevels, ...lookups, 'getRecordsByTagName SourceRef'],
			},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			// read inside the transaction, asserted after it (the transaction reports a failure inside it as its own),
			// then rolled back: the staged writes only shape what the read sees
			let read: { orphaned: string[]; calls: string[] } | undefined
			const rolledBack = source.transaction(async function readOrphaned(tx) {
				for (const deleted of testCase.deleted ?? []) {
					await tx.delete({ tagName: 'SourceRef', id: deleted })
				}
				for (const created of testCase.created ?? []) {
					await tx.addChild(
						{ tagName: 'LNodeInputs', id: 'l2-inputs' },
						{ tagName: 'SourceRef', id: created.id, attributes: created.attributes },
					)
				}
				for (const updated of testCase.updated ?? []) {
					await tx.update({ tagName: 'SourceRef', id: updated }, { attributes: { input: 'Z' } })
				}
				const found = await tx.getRecords(REFERRER_ROOTS)
				const records = found.flatMap((record) => (record ? [record] : []))
				const { query, calls } = countQueryReads(tx as Core.Query<Config>)
				const orphaned = await findOrphanedRefs({ records, query })
				read = { orphaned: orphaned.map(describeOrphaned), calls: describeCalls(calls) }
				throw new Error(ROLL_BACK)
			})
			await expect(rolledBack).rejects.toThrow(ROLL_BACK)
			expect(read).toEqual({
				orphaned: testCase.expectedOrphaned,
				calls: testCase.expectedCalls,
			})
		},
	})
})

describe('buildCascadeOperations reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The operations, as `<status> <tag> <id>`, an update with the children it keeps. */
		expectedOperations: string[]
		/** Parents other operations of the commit write, by id: their children in reverse order. */
		pending?: string[]
		/** The methods called on the query, in order, a `getRecords` with the ids it read. */
		expectedReads: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a function and an input deleted → one update per parent that stays, in the order before, the parents read in one batch':
			{
				sourceXml: referrersByUuidXml,
				expectedOperations: [
					'updated SourceRef sr-a ',
					'updated SourceRef sr-b ',
					'updated SourceRef sr-c ',
					'deleted Function f1',
					'deleted ExtRef ext1',
					'deleted FunctionCatRef category-ref',
					'updated Substation s1 category-private,f2',
					'updated Inputs inputs ',
					'updated FunctionCategory category ',
				],
				expectedReads: ['getRecords category,inputs,s1'],
			},
		"a parent written by the commit's other operations → updated from what they write, not read": {
			sourceXml: referrersByUuidXml,
			pending: ['s1'],
			expectedOperations: [
				'updated SourceRef sr-a ',
				'updated SourceRef sr-b ',
				'updated SourceRef sr-c ',
				'deleted Function f1',
				'deleted ExtRef ext1',
				'deleted FunctionCatRef category-ref',
				'updated Substation s1 f2,category-private',
				'updated Inputs inputs ',
				'updated FunctionCategory category ',
			],
			expectedReads: ['getRecords category,inputs'],
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const found = await source.query.getRecords(REFERRER_ROOTS)
			const roots = found.flatMap((record) => (record ? [record] : []))
			const cascade = await collectDeleteCascade(source.query, { roots, emptiesContainers: false })
			const written = await source.query.getRecords(
				(testCase.pending ?? []).map((pendingId) => ({
					tagName: 'Substation' as const,
					id: pendingId,
				})),
			)
			const pending = new Map(
				written.flatMap((record) =>
					record
						? [
								[
									record.id,
									widen(toRawRecord({ ...record, children: [...record.children].reverse() })),
								] as const,
							]
						: [],
				),
			)
			const { query, calls } = countQueryReads(source.query)
			const operations = await buildCascadeOperations(query, {
				cascade,
				deletedRoots: roots,
				pending,
			})
			const reads = calls.map(({ method, args }) =>
				method === 'getRecords'
					? `${method} ${(args[0] as Scl.Ref<Scl.ElementsOf>[])
							.map((ref) => ref.id)
							.sort()
							.join(',')}`
					: method,
			)
			const described = operations.map((operation) =>
				operation.status === 'updated'
					? `updated ${operation.newRecord.tagName} ${operation.newRecord.id} ${operation.newRecord.children.map((child) => child.id).join(',')}`
					: `${operation.status} ${operation.oldRecord?.tagName} ${operation.oldRecord?.id}`,
			)
			expect({ operations: described, reads }).toEqual({
				operations: testCase.expectedOperations,
				reads: testCase.expectedReads,
			})
		},
	})
})
