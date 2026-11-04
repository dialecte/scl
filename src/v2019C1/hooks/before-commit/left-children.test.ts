import { findLeftChildren } from './left-children'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestRecord,
	runSclTestCases,
} from '@/v2019C1/test'
import { countQueryReads } from '@/v2019C1/test/count-query-reads'

import type { LeftChild } from './left-children.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** F1 holds a logical node `child`; F2 holds nothing. */
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="s1">
			<Function name="F1" ${id}="f1">
				<LNode iedName="None" lnClass="XCBR" lnInst="1" ${id}="child"/>
			</Function>
			<Function name="F2" ${id}="f2"/>
		</Substation>
	</SCL>
`

const SUBSTATION = { tagName: 'Substation', id: 's1' } as const
const PARENT = { tagName: 'Function', id: 'f1' } as const
const OTHER_PARENT = { tagName: 'Function', id: 'f2' } as const
const CHILD = { tagName: 'LNode', id: 'child' } as const
const NEW_CHILD = { tagName: 'LNode', id: 'new-child' } as const
const GHOST = { tagName: 'LNode', id: 'ghost' } as const

/** F1 as the log holds it, with the children it lists. */
function parentRecord(params: {
	children: Scl.Ref<'LNode'>[]
	desc?: string
}): Scl.RawRecord<Scl.ElementsOf> {
	const { children, desc } = params
	return createSclTestRecord({
		record: {
			...PARENT,
			parent: SUBSTATION,
			children,
			attributes: desc === undefined ? { name: 'F1' } : { name: 'F1', desc },
		},
	})
}

function childRecord(params: {
	child: Scl.Ref<'LNode'>
	parent: Scl.Ref<'Function'>
}): Scl.RawRecord<Scl.ElementsOf> {
	const { child, parent } = params
	return createSclTestRecord({ record: { ...child, parent } })
}

function deleted(oldRecord: Scl.RawRecord<Scl.ElementsOf>): Scl.Operation {
	return { status: 'deleted', oldRecord, newRecord: undefined }
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

type TestCase = SclTest.BaseXmlTestCase & {
	/** The transaction log. */
	operations: Scl.Operation[]
	/** The children left behind. */
	expected: LeftChild[]
	/** The methods called on the query, in order. */
	expectedReads: string[]
}

describe('findLeftChildren', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a parent deleted with its child deleted → none': {
			sourceXml,
			operations: [
				deleted(parentRecord({ children: [CHILD] })),
				deleted(childRecord({ child: CHILD, parent: PARENT })),
			],
			expected: [],
			expectedReads: [],
		},
		'a parent deleted, its child not → the child, read in one batch': {
			sourceXml,
			operations: [deleted(parentRecord({ children: [CHILD] }))],
			expected: [{ record: PARENT, child: CHILD }],
			expectedReads: ['getRecords'],
		},
		'a child moved to another parent by an update, then the parent deleted → none': {
			sourceXml,
			operations: [
				updated(
					childRecord({ child: CHILD, parent: PARENT }),
					childRecord({ child: CHILD, parent: OTHER_PARENT }),
				),
				deleted(parentRecord({ children: [CHILD] })),
			],
			expected: [],
			expectedReads: [],
		},
		'a child created under another parent after the parent listed it, then the parent deleted → none':
			{
				sourceXml,
				operations: [
					updated(parentRecord({ children: [] }), parentRecord({ children: [NEW_CHILD] })),
					created(childRecord({ child: NEW_CHILD, parent: OTHER_PARENT })),
					deleted(parentRecord({ children: [] })),
				],
				expected: [],
				expectedReads: [],
			},
		'a child updated but kept under the deleted parent → the child, no read': {
			sourceXml,
			operations: [
				updated(
					childRecord({ child: CHILD, parent: PARENT }),
					childRecord({ child: CHILD, parent: PARENT }),
				),
				deleted(parentRecord({ children: [CHILD] })),
			],
			expected: [{ record: PARENT, child: CHILD }],
			expectedReads: [],
		},
		'a deleted parent listing a child and a child id that is no record → the child only, read in one batch':
			{
				sourceXml,
				operations: [deleted(parentRecord({ children: [CHILD, GHOST] }))],
				expected: [{ record: PARENT, child: CHILD }],
				expectedReads: ['getRecords'],
			},
		'a parent updated to gain a child created in the transaction, then deleted alone → the new child':
			{
				sourceXml,
				operations: [
					created(childRecord({ child: NEW_CHILD, parent: PARENT })),
					updated(parentRecord({ children: [] }), parentRecord({ children: [NEW_CHILD] })),
					deleted(parentRecord({ children: [] })),
				],
				expected: [{ record: PARENT, child: NEW_CHILD }],
				expectedReads: [],
			},
		'a record created then deleted, with its child created then deleted → none': {
			sourceXml,
			operations: [
				created(parentRecord({ children: [NEW_CHILD] })),
				created(childRecord({ child: NEW_CHILD, parent: PARENT })),
				deleted(childRecord({ child: NEW_CHILD, parent: PARENT })),
				deleted(parentRecord({ children: [NEW_CHILD] })),
			],
			expected: [],
			expectedReads: [],
		},
		'a parent updated, not deleted → none': {
			sourceXml,
			operations: [
				created(childRecord({ child: NEW_CHILD, parent: PARENT })),
				updated(
					parentRecord({ children: [CHILD] }),
					parentRecord({ children: [CHILD, NEW_CHILD] }),
				),
			],
			expected: [],
			expectedReads: [],
		},
		'a child id that is no record in a deleted parent → none, one read of it': {
			sourceXml,
			operations: [deleted(parentRecord({ children: [GHOST] }))],
			expected: [],
			expectedReads: ['getRecords'],
		},
		'a transaction deleting nothing, a parent updated by its attributes only → none, no read': {
			sourceXml,
			operations: [
				updated(
					parentRecord({ children: [CHILD] }),
					parentRecord({ children: [CHILD], desc: 'renamed' }),
				),
			],
			expected: [],
			expectedReads: [],
		},
	}

	runSclTestCases.withoutExport({
		testCases,
		act: async ({ source, testCase }) => {
			const { query, reads } = countQueryReads(source.query)
			const left = await findLeftChildren({ operations: testCase.operations, query })
			expect({ left, reads }).toEqual({ left: testCase.expected, reads: testCase.expectedReads })
		},
	})
})
