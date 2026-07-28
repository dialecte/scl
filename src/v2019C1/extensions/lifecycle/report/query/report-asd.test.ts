import { reportAsd } from './report-asd'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate?: (tx: Scl.Transaction) => Promise<void>
	expected: { needsDecisions: boolean; groupTags: string[] }
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
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
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

describe('reportAsd (application layer + composed-function cascade)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no change → nothing to decide across both layers': {
			sourceXml,
			targetXml,
			expected: { needsDecisions: false, groupTags: [] },
		},

		'a composed-function change is aggregated into the report (function layer)': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.addChild({ tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '1', lnType: 'CSWI_Type' },
				})
			},
			expected: { needsDecisions: true, groupTags: ['LNode'] },
		},

		'an application-layer change is reported': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.addChild(applicationRef, {
					tagName: 'FunctionRole',
					attributes: { name: 'ROLE2' },
				})
			},
			expected: { needsDecisions: true, groupTags: ['FunctionRole'] },
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})
		if (testCase.mutate) await source.transaction(testCase.mutate)

		const report = await reportAsd(target.query, { sourceQuery: source.query, applicationRef })

		expect(report.needsDecisions).toBe(testCase.expected.needsDecisions)
		for (const tag of testCase.expected.groupTags) {
			expect(allGroups(report).some((group) => group.primary.tagName === tag)).toBe(true)
		}
		if (testCase.expected.groupTags.length === 0) expect(allGroups(report)).toHaveLength(0)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
