import { collectFromTags } from './collect-from-tags'
import { collectFromTree } from './collect-from-tree'

import { describe, expect, it } from 'vitest'

import { IED_SECTION_SELECT } from '@/v2019C1/extensions/dataflow/constants/ied-section.constants'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test/hydrated-test'

import type { CollectSelect } from './collect-with-ancestry.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

type TestCase = SclTest.BaseXmlTestCase & {
	select: CollectSelect
	mutate?: (tx: Scl.Transaction) => Promise<void>
	expectedTagNames?: readonly string[]
	expectedRecordIds?: readonly string[]
}

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const iedXml = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<IED name="IED1" ${id}="ied-1">
			<AccessPoint name="AP1" ${id}="ap-1">
				<Server ${id}="server-1">
					<LDevice inst="LD0" ${id}="ld-1">
						<LN0 lnClass="LLN0" inst="" lnType="LT" ${id}="ln0-1">
							<GSEControl name="gse" confRev="1" ${id}="gse-1">
								<IEDName ${id}="iedname-1">IED1</IEDName>
							</GSEControl>
						</LN0>
						<LN lnClass="GGIO" inst="1" lnType="LT" ${id}="ln-1"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
		<DataTypeTemplates ${id}="dtt-1">
			<LNodeType id="LT" lnClass="GGIO" ${id}="lt-1"/>
		</DataTypeTemplates>
	</SCL>
`

const nestedSubFunctionXml = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="S1" ${id}="sub-1">
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1">
					<Function name="F1" ${id}="fn-1">
						<SubFunction name="SF1" ${id}="sf-1">
							<LNode iedName="None" lnClass="XCBR" lnInst="1" ${id}="lnode-1"/>
							<SubFunction name="SF2" ${id}="sf-2">
								<LNode iedName="None" lnClass="CSWI" lnInst="1" ${id}="lnode-2"/>
							</SubFunction>
						</SubFunction>
						<LNode iedName="None" lnClass="PTRC" lnInst="1" ${id}="lnode-3"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('collectWithAncestry paths agree', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a ReportControl appended after a GSEControl → the schema sequence, as the tree gives it': {
			sourceXml: iedXml,
			select: IED_SECTION_SELECT,
			mutate: async (tx) => {
				await tx.addChild({ tagName: 'LN0', id: 'ln0-1' } as Scl.Ref<'LN0'>, {
					tagName: 'ReportControl',
					attributes: { name: 'rpt', confRev: '1' },
				})
			},
			expectedTagNames: [
				'SCL',
				'IED',
				'AccessPoint',
				'Server',
				'LDevice',
				'LN0',
				'ReportControl',
				'GSEControl',
				'IEDName',
				'LN',
			],
		},
		'an LN0 appended after the LNs → the schema sequence, as the tree gives it': {
			sourceXml: iedXml,
			select: IED_SECTION_SELECT,
			mutate: async (tx) => {
				await tx.delete({ tagName: 'LN0', id: 'ln0-1' } as Scl.Ref<'LN0'>)
				await tx.addChild({ tagName: 'LDevice', id: 'ld-1' } as Scl.Ref<'LDevice'>, {
					tagName: 'LN0',
					attributes: { lnClass: 'LLN0', inst: '', lnType: 'LT' },
				})
			},
			expectedTagNames: ['SCL', 'IED', 'AccessPoint', 'Server', 'LDevice', 'LN0', 'LN'],
		},
		'SubFunctions nested in SubFunctions → read through the select of the first, as the tree gives it':
			{
				sourceXml: nestedSubFunctionXml,
				select: {
					Substation: {
						VoltageLevel: { Bay: { Function: { SubFunction: { LNode: true } } } },
					},
				},
				expectedRecordIds: [
					'scl-1',
					'sub-1',
					'vl-1',
					'bay-1',
					'fn-1',
					'sf-1',
					'lnode-1',
					'sf-2',
					'lnode-2',
				],
			},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		hooks: {},
		act: async ({ source, testCase }) => {
			if (testCase.mutate) await source.transaction(testCase.mutate)
			const root = { tagName: 'SCL' } as const
			const fromTags = await collectFromTags(source.query, { select: testCase.select })
			const fromTree = await collectFromTree(source.query, { root, select: testCase.select })

			const ids = (records: readonly { id: string }[]) => records.map((record) => record.id)
			expect(ids(fromTags.records)).toEqual(ids(fromTree.records))
			for (const record of fromTree.records) {
				expect(ids(fromTags.ancestryOf(record.id))).toEqual(ids(fromTree.ancestryOf(record.id)))
			}
			if (testCase.expectedTagNames) {
				expect(fromTags.records.map((record) => record.tagName)).toEqual(testCase.expectedTagNames)
			}
			if (testCase.expectedRecordIds) {
				expect(ids(fromTags.records)).toEqual(testCase.expectedRecordIds)
			}
		},
	})
})

describe('CollectSelect', () => {
	it('refuses the options of a getTree select, which are not tags', () => {
		// @ts-expect-error `where` filters a getTree select, it names no tag
		const withWhere: CollectSelect = { Substation: { where: { name: 'S1' } } }
		// @ts-expect-error `recursive` re-applies a getTree select, it names no tag
		const withRecursive: CollectSelect = { Substation: { recursive: true } }
		expect([withWhere, withRecursive]).toHaveLength(2)
	})
})
