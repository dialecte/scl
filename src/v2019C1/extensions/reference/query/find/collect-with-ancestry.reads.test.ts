import { collectWithAncestry } from './collect-with-ancestry'

import { describe, expect } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { CollectWithAncestryParams } from './collect-with-ancestry.types'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const ID = CUSTOM_RECORD_ID_ATTRIBUTE
const NS = ALL_XMLNS_NAMESPACES

/** The store call that reads the whole document, counted by the dev perf counters. */
const DOCUMENT_READ = 'core::store::getByDocumentId'

/** P1 holds the logical device LD0 (a logical node with a data instance) beside LD1; a substation sits beside it. */
const IED_WITH_TWO_DEVICES = /* xml */ `
	<SCL ${NS} ${ID}="root">
		<Header id="project" ${ID}="header"/>
		<Substation name="S1" ${ID}="s1">
			<VoltageLevel name="E1" ${ID}="e1">
				<Bay name="Q01" ${ID}="q01"/>
			</VoltageLevel>
		</Substation>
		<IED name="P1" ${ID}="p1">
			<AccessPoint name="AP1" ${ID}="ap1">
				<Server ${ID}="server">
					<Authentication ${ID}="auth"/>
					<LDevice inst="LD0" ${ID}="ld0">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${ID}="ld0-lln0"/>
						<LN lnClass="XCBR" inst="1" lnType="XCBR_T" ${ID}="ld0-xcbr">
							<DOI name="Pos" ${ID}="ld0-pos"/>
						</LN>
					</LDevice>
					<LDevice inst="LD1" ${ID}="ld1">
						<LN0 lnClass="LLN0" inst="" lnType="LLN0_T" ${ID}="ld1-lln0"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>`

type TestCase = SclTest.BaseXmlTestCase & {
	/** What `collectWithAncestry` is given: a root, or none (the document root). */
	params: CollectWithAncestryParams
	expected: { documentReads: number; records: string[]; ancestryOfLast: string[] }
}

// A subtree below the document root is read by itself, level by level: the whole document is read only when the
// subtree is the document.
describe('collectWithAncestry - a subtree below the document root reads no whole document', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a logical device as the root → its subtree in document order, its ancestors above it, no whole-document read':
			{
				sourceXml: IED_WITH_TWO_DEVICES,
				params: { root: { tagName: 'LDevice', id: 'ld0' } },
				expected: {
					documentReads: 0,
					records: ['ld0', 'ld0-lln0', 'ld0-xcbr', 'ld0-pos'],
					ancestryOfLast: ['root', 'p1', 'ap1', 'server', 'ld0', 'ld0-xcbr'],
				},
			},
		'the document root → the whole document, read once': {
			sourceXml: IED_WITH_TWO_DEVICES,
			params: {},
			expected: {
				documentReads: 1,
				records: [
					'root',
					'header',
					's1',
					'e1',
					'q01',
					'p1',
					'ap1',
					'server',
					'auth',
					'ld0',
					'ld0-lln0',
					'ld0-xcbr',
					'ld0-pos',
					'ld1',
					'ld1-lln0',
				],
				ancestryOfLast: ['root', 'p1', 'ap1', 'server', 'ld1'],
			},
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		dev: { perf: true },
		act: async ({ source, testCase }) => {
			source.perf.reset()
			const collected = await collectWithAncestry(source.query, testCase.params)
			const documentReads = source.perf.report()[DOCUMENT_READ]?.count ?? 0
			const records = collected.records.map((record) => record.id)
			const last = records.at(-1) ?? ''
			expect({
				documentReads,
				records,
				ancestryOfLast: collected.ancestryOf(last).map((record) => record.id),
			}).toEqual(testCase.expected)
		},
	})
})
