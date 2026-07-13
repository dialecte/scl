import { diff } from './diff'

import { describe, expect } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { DiffSummary } from './diff.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate?: (tx: Scl.Transaction) => Promise<void>
	expected: {
		needsDecisions: boolean
		summary: DiffSummary
		groups: { change: 'added' | 'removed' | 'modified'; tagName: string }[]
	}
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('engine.diff (project-then-diff report + classify)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no change → nothing to decide (fast)': {
			sourceXml,
			targetXml,
			expected: {
				needsDecisions: false,
				summary: { added: 0, removed: 0, modified: 0 },
				groups: [],
			},
		},

		'changed attribute → modified, needs decisions (full)': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'v2' } })
			},
			expected: {
				needsDecisions: true,
				summary: { added: 0, removed: 0, modified: 1 },
				groups: [{ change: 'modified', tagName: 'Function' }],
			},
		},

		'added element → added, needs decisions (full)': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.addChild(functionRef, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '1', lnType: 'CSWI_Type' },
				})
			},
			expected: {
				needsDecisions: true,
				summary: { added: 1, removed: 0, modified: 0 },
				groups: [{ change: 'added', tagName: 'LNode' }],
			},
		},

		'removed element → removed, needs decisions (full)': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.delete({ tagName: 'LNode', id: 'lnode-1' } as Scl.Ref<'LNode'>)
			},
			expected: {
				needsDecisions: true,
				summary: { added: 0, removed: 1, modified: 0 },
				groups: [{ change: 'removed', tagName: 'LNode' }],
			},
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// instantiate v1 -> the existing instance
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})
		const [instanceFunction] = await target.query.any.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'fn-src-uuid' },
		})
		if (!instanceFunction) throw new Error('instance not found')

		if (testCase.mutate) await source.transaction(testCase.mutate)

		const report = await diff({
			sourceQuery: source.query,
			targetQuery: target.query,
			sourceRootRef: functionRef,
			instanceRootRef: instanceFunction,
		})

		expect(report.needsDecisions).toBe(testCase.expected.needsDecisions)
		expect(report.summary).toEqual(testCase.expected.summary)
		expect(report.groups.map((g) => ({ change: g.change, tagName: g.primary.tagName }))).toEqual(
			testCase.expected.groups,
		)

		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
