import { reportSsd } from './report-ssd'

import { describe, expect } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const scopeRef = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate?: (tx: Scl.Transaction) => Promise<void>
	expected: { needsDecisions: boolean; groupTags: string[] }
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="ssd">
		<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="14" ${id}="hdr-s"/>
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="B1" ${id}="bay-s">
					<Private type="eIEC61850-6-100" ${id}="bay-priv-s">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
								<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
									<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/B1/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="lnode-src-uuid" ${id}="lnode-1"/>
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
		<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

// Report over an SSD scope: instantiate it into the project, then diff a (possibly mutated) SSD
// against the instance. The report merges the per-primary reports (application + its composed
// function cascade + any standalone function).
describe('reportSsd (topology scope = applications + standalone functions)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'no change across the SSD -> nothing to decide': {
			sourceXml,
			targetXml,
			expected: { needsDecisions: false, groupTags: [] },
		},

		'a composed-function change is reported (function-layer cascade)': {
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
				await tx.addChild({ tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>, {
					tagName: 'FunctionRole',
					attributes: { name: 'ROLE2' },
				})
			},
			expected: { needsDecisions: true, groupTags: ['FunctionRole'] },
		},

		'a topology-frame change (Bay attribute) is reported as its own group': {
			sourceXml,
			targetXml,
			mutate: async (tx) => {
				await tx.update({ tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>, {
					attributes: { desc: 'changed' },
				})
			},
			expected: { needsDecisions: true, groupTags: ['Bay'] },
		},
	}

	async function act({ testCase, source, target }: SclTest.ActParams<TestCase>): Promise<void> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateSsd(tx, { sourceQuery: source.query, scopeRef, targetParent: bayRef })
		})
		if (testCase.mutate) await source.transaction(testCase.mutate)

		const report = await reportSsd(target.query, {
			sourceQuery: source.query,
			scopeRef,
			targetParent: bayRef,
		})

		expect(report.needsDecisions).toBe(testCase.expected.needsDecisions)
		for (const tag of testCase.expected.groupTags) {
			expect(allGroups(report).some((group) => group.primary.tagName === tag)).toBe(true)
		}
		if (testCase.expected.groupTags.length === 0) expect(allGroups(report)).toHaveLength(0)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
