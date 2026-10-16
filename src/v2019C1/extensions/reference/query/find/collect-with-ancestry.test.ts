import { collectWithAncestry } from './collect-with-ancestry'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { CollectWithAncestryParams } from './collect-with-ancestry.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase &
	CollectWithAncestryParams & {
		expectedRecordIds?: readonly string[]
		expectedAncestry?: Readonly<Record<string, readonly string[]>>
	}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="S1" ${id}="sub-1">
			<Function name="F1" ${id}="fn-1">
				<LNode iedName="None" lnClass="XCBR" lnInst="1" ${id}="lnode-1"/>
				<LNode iedName="None" lnClass="PTRC" lnInst="1" ${id}="lnode-3">
					<Private type="eIEC61850-6-100" ${id}="priv-1">
						<eIEC61850-6-100:LNodeOutputs ${id}="lno-1">
							<eIEC61850-6-100:ControlRef controlled="S1/F1/XCBR1" ${id}="cref-1"/>
						</eIEC61850-6-100:LNodeOutputs>
					</Private>
				</LNode>
				<SubFunction name="SF1" ${id}="sf-1">
					<LNode iedName="None" lnClass="CSWI" lnInst="1" ${id}="lnode-2"/>
				</SubFunction>
			</Function>
			<Function name="F2" ${id}="fn-2">
				<LNode iedName="None" lnClass="MMXU" lnInst="1" ${id}="lnode-4"/>
			</Function>
		</Substation>
	</SCL>
`

describe('collectWithAncestry', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'whole document → every element in document order, the root first, Private wrappers left out': {
			sourceXml,
			root: { tagName: 'SCL' },
			expectedRecordIds: [
				'scl-1',
				'sub-1',
				'fn-1',
				'lnode-1',
				'lnode-3',
				'lno-1',
				'cref-1',
				'sf-1',
				'lnode-2',
				'fn-2',
				'lnode-4',
			],
		},
		'LNode inside a SubFunction → ancestry outermost first, from the document root to its parent': {
			sourceXml,
			root: { tagName: 'SCL' },
			expectedAncestry: {
				'lnode-2': ['scl-1', 'sub-1', 'fn-1', 'sf-1'],
				'lnode-4': ['scl-1', 'sub-1', 'fn-2'],
				'sub-1': ['scl-1'],
				'scl-1': [],
			},
		},
		'ControlRef below a Private wrapper → the Private is not part of the ancestry': {
			sourceXml,
			root: { tagName: 'SCL' },
			expectedAncestry: {
				'cref-1': ['scl-1', 'sub-1', 'fn-1', 'lnode-3', 'lno-1'],
			},
		},
		'root below SCL → its subtree only, the ancestry of each element including the root and what is above it':
			{
				sourceXml,
				root: { tagName: 'Function', id: 'fn-1' },
				expectedRecordIds: ['fn-1', 'lnode-1', 'lnode-3', 'lno-1', 'cref-1', 'sf-1', 'lnode-2'],
				expectedAncestry: {
					'fn-1': ['scl-1', 'sub-1'],
					'lnode-1': ['scl-1', 'sub-1', 'fn-1'],
					'lnode-2': ['scl-1', 'sub-1', 'fn-1', 'sf-1'],
				},
			},
		'another root below SCL → its own subtree, none of the first root': {
			sourceXml,
			root: { tagName: 'Function', id: 'fn-2' },
			expectedRecordIds: ['fn-2', 'lnode-4'],
			expectedAncestry: { 'lnode-4': ['scl-1', 'sub-1', 'fn-2'] },
		},
		'select naming Substation > Function → the Substations and their Functions are read, nothing below them':
			{
				sourceXml,
				select: { Substation: { Function: { LNode: false } } },
				expectedRecordIds: ['scl-1', 'sub-1', 'fn-1', 'fn-2'],
			},
		'select ending with LNode: true → the LNodes and everything below them, a Private wrapper gone through':
			{
				sourceXml,
				select: { Substation: { Function: { LNode: true } } },
				expectedRecordIds: [
					'scl-1',
					'sub-1',
					'fn-1',
					'lnode-1',
					'lnode-3',
					'lno-1',
					'cref-1',
					'fn-2',
					'lnode-4',
				],
				expectedAncestry: { 'cref-1': ['scl-1', 'sub-1', 'fn-1', 'lnode-3', 'lno-1'] },
			},
		'select through SubFunction → only the LNodes at that place, not those of the same tag elsewhere':
			{
				sourceXml,
				select: { Substation: { Function: { SubFunction: { LNode: true } } } },
				expectedRecordIds: ['scl-1', 'sub-1', 'fn-1', 'sf-1', 'lnode-2', 'fn-2'],
				expectedAncestry: { 'lnode-2': ['scl-1', 'sub-1', 'fn-1', 'sf-1'] },
			},
		'select naming Substation: true → the whole subtree in document order': {
			sourceXml,
			select: { Substation: true },
			expectedRecordIds: [
				'scl-1',
				'sub-1',
				'fn-1',
				'lnode-1',
				'lnode-3',
				'lno-1',
				'cref-1',
				'sf-1',
				'lnode-2',
				'fn-2',
				'lnode-4',
			],
		},
		'id of an element not read → empty ancestry': {
			sourceXml,
			root: { tagName: 'Function', id: 'fn-1' },
			expectedAncestry: { 'lnode-4': [], unknown: [] },
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			const { root, select } = testCase
			const collected = await collectWithAncestry(source.query, { root, select })
			const ids = (records: readonly { id: string }[]) => records.map((record) => record.id)

			if (testCase.expectedRecordIds) {
				expect(ids(collected.records)).toEqual(testCase.expectedRecordIds)
			}
			for (const [elementId, expectedIds] of Object.entries(testCase.expectedAncestry ?? {})) {
				expect(ids(collected.ancestryOf(elementId))).toEqual(expectedIds)
			}
		},
	})
})
