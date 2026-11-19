import { findTargetsByUuid } from './find-targets-by-uuid'

import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { TargetSought } from './find-targets-by-uuid.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** Two Functions, each holding one LNode, every element with its own uuid. */
const SOURCE_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="s1" name="S1">
			<Function ${id}="f1" name="F1" uuid="u-f1">
				<LNode ${id}="l1" iedName="None" lnClass="XCBR" lnInst="1" uuid="u-l1"/>
			</Function>
			<Function ${id}="f2" name="F2" uuid="u-f2">
				<LNode ${id}="l2" iedName="None" lnClass="CSWI" lnInst="1" uuid="u-l2"/>
			</Function>
		</Substation>
	</SCL>
`

/** A Function and an LNode carrying one uuid, and two LNodes carrying another. */
const SHARED_UUIDS_XML = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="s1" name="S1">
			<Function ${id}="f1" name="F1" uuid="u-shared">
				<LNode ${id}="lb" iedName="None" lnClass="XCBR" lnInst="1" uuid="u-shared"/>
				<LNode ${id}="lz" iedName="None" lnClass="XCBR" lnInst="2" uuid="u-dup"/>
				<LNode ${id}="la" iedName="None" lnClass="XCBR" lnInst="3" uuid="u-dup"/>
			</Function>
		</Substation>
	</SCL>
`

/** An element found by tag and id, or by name for the one a test added (its id is the store's); `null` for none. */
function describeFound(record: Scl.TrackedRecord<Scl.ElementsOf> | undefined): string | null {
	if (!record) return null
	const name = record.attributes.find((attribute) => attribute.name === 'name')?.value
	return `${record.tagName}:${record.id.length > 3 ? name : record.id}`
}

/**
 * The elements many uuids name, each among its tags in their order, the first match of the first tag holding one:
 * one value-list lookup per tag and round (round r tries the r-th tag of each uuid still not found), whatever the
 * number of uuids; a single uuid costs one lookup per tag tried, as a lookup of it alone.
 */
describe('findTargetsByUuid - the elements many uuids name', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		sought: TargetSought[]
		before?: (tx: Core.Transaction<Config>) => Promise<void>
		expected: { found: (string | null)[]; lookups: [string, number][] }
	}

	const both = ['Function', 'LNode']
	const testCases: SclTest.TestCases<TestCase> = {
		'one uuid of a Function → the Function, one lookup': {
			sourceXml: SOURCE_XML,
			sought: [{ uuid: 'u-f1', targetTagNames: ['Function'] }],
			expected: { found: ['Function:f1'], lookups: [['Function', 1]] },
		},
		'one uuid the second tag holds → found there, one lookup per tag tried': {
			sourceXml: SOURCE_XML,
			sought: [{ uuid: 'u-l1', targetTagNames: both }],
			expected: {
				found: ['LNode:l1'],
				lookups: [
					['Function', 1],
					['LNode', 1],
				],
			},
		},
		'four uuids among the same two tags → one lookup per tag and round': {
			sourceXml: SOURCE_XML,
			sought: ['u-f1', 'u-f2', 'u-l1', 'u-l2'].map((uuid) => ({ uuid, targetTagNames: both })),
			expected: {
				found: ['Function:f1', 'Function:f2', 'LNode:l1', 'LNode:l2'],
				lookups: [
					['Function', 4],
					['LNode', 2],
				],
			},
		},
		'uuids sought among their tags in other orders → each tag of a round looked up once': {
			sourceXml: SOURCE_XML,
			sought: [
				{ uuid: 'u-l1', targetTagNames: ['LNode', 'Function'] },
				{ uuid: 'u-f1', targetTagNames: both },
				{ uuid: 'u-f2', targetTagNames: ['LNode', 'Function'] },
			],
			expected: {
				found: ['LNode:l1', 'Function:f1', 'Function:f2'],
				lookups: [
					['LNode', 2],
					['Function', 1],
					['Function', 1],
				],
			},
		},
		'a uuid naming nothing → nothing, every tag tried': {
			sourceXml: SOURCE_XML,
			sought: [{ uuid: 'u-none', targetTagNames: both }],
			expected: {
				found: [null],
				lookups: [
					['Function', 1],
					['LNode', 1],
				],
			},
		},
		'an empty uuid beside a uuid of a Function → nothing for it, the Function looked up alone': {
			sourceXml: SOURCE_XML,
			sought: [
				{ uuid: '', targetTagNames: both },
				{ uuid: 'u-f1', targetTagNames: ['Function'] },
			],
			expected: { found: [null, 'Function:f1'], lookups: [['Function', 1]] },
		},
		'one uuid sought twice → the same element for both, the value looked up once': {
			sourceXml: SOURCE_XML,
			sought: [
				{ uuid: 'u-f1', targetTagNames: ['Function'] },
				{ uuid: 'u-f1', targetTagNames: ['Function'] },
			],
			expected: { found: ['Function:f1', 'Function:f1'], lookups: [['Function', 1]] },
		},
		'inside a transaction → the elements as staged: added, deleted, uuid moved': {
			sourceXml: SOURCE_XML,
			before: async (tx) => {
				await tx.addChild(
					{ tagName: 'Substation', id: 's1' },
					{ tagName: 'Function', attributes: { name: 'F3', uuid: 'u-f3' } },
				)
				await tx.delete({ tagName: 'LNode', id: 'l2' })
				await tx.update({ tagName: 'Function', id: 'f2' }, { attributes: { uuid: 'u-f2-moved' } })
			},
			sought: [
				{ uuid: 'u-f3', targetTagNames: ['Function'] },
				{ uuid: 'u-l2', targetTagNames: ['LNode'] },
				{ uuid: 'u-f2', targetTagNames: ['Function'] },
				{ uuid: 'u-f2-moved', targetTagNames: ['Function'] },
			],
			expected: {
				found: ['Function:F3', null, null, 'Function:f2'],
				lookups: [
					['Function', 3],
					['LNode', 1],
				],
			},
		},
		'a uuid two tags carry → the first tag; one two elements of a tag carry → the first the tag answers':
			{
				sourceXml: SHARED_UUIDS_XML,
				allowInvalidFixture: {
					reason:
						'shared uuids: the first tag tried, then the first the tag answers, as a lookup of one uuid',
					violations: [{ check: 'identity', code: 'duplicate-instance-uuid' }],
				},
				sought: [
					{ uuid: 'u-shared', targetTagNames: both },
					{ uuid: 'u-shared', targetTagNames: ['LNode', 'Function'] },
					{ uuid: 'u-dup', targetTagNames: ['LNode'] },
				],
				// the store answers a tag in id order: la before lz
				expected: {
					found: ['Function:f1', 'LNode:lb', 'LNode:la'],
					lookups: [
						['Function', 1],
						['LNode', 2],
					],
				},
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			let observed: unknown
			await source.transaction(async (tx) => {
				await testCase.before?.(tx)
				const { query, calls } = countQueryReads(tx)
				const records = await findTargetsByUuid(query, { sought: testCase.sought })
				// an element by tag and id, or by name when the test added it (its id is the store's)
				const found = records.map(describeFound)
				const lookups = calls
					.filter((call) => call.method === 'findByAttributes')
					.map((call) => {
						const { tagName, attributes } = call.args[0] as {
							tagName: string
							attributes: { uuid: string | string[] }
						}
						return [tagName, [attributes.uuid].flat().length]
					})
				observed = { found, lookups }
			})
			expect(observed).toEqual(testCase.expected)
		},
	})
})
