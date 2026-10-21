import { describe, expect } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { LifecycleTarget } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t1' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	preInstantiate: boolean
	mutate?: (tx: Scl.Transaction) => Promise<void>
	expectedNeedsDecisions: boolean
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
	</SCL>
`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t1"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('lifecycle two-track surface (report + apply)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'fast (first-time): no decisions -> apply instantiates headless': {
			sourceXml,
			targetXml,
			preInstantiate: false,
			expectedNeedsDecisions: false,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
			],
		},

		'fast (existing instance, no change): no decisions -> apply reconciles (idempotent, no duplicate)':
			{
				sourceXml,
				targetXml,
				preInstantiate: true,
				expectedNeedsDecisions: false,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				],
				unexpectedQueries: [
					// no second copy added by the reconcile
					'//default:Bay[@name="B1"]/default:Function[@name="Prot"][2]',
				],
			},

		'full (existing instance + change): needs decisions -> apply is a no-op (nothing written)': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				await tx.update(functionRef, { attributes: { desc: 'v2' } })
			},
			expectedNeedsDecisions: true,
			expectedQueries: [
				// the v1 instance is untouched
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
			],
			unexpectedQueries: [
				// the template change was NOT applied (full track waits for decisions)
				'//default:Bay[@name="B1"]/default:Function[@name="Prot"][@desc="v2"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		if (testCase.preInstantiate) {
			await target.transaction(async (tx) => {
				await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
			})
		}
		if (testCase.mutate) {
			await source.transaction(testCase.mutate)
		}

		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})
		expect(rep.needsDecisions).toBe(testCase.expectedNeedsDecisions)

		const applied = await target.transaction(async (tx) => {
			return apply(tx, {
				verb: 'fsd',
				sourceQuery: source.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
			})
		})
		// the full track waits: the report back, no element written
		if (testCase.expectedNeedsDecisions) {
			expect(applied).toEqual({ report: rep, instances: { verb: 'fsd', functions: [] } })
		}

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// an application composing one function, and a project whose instance of it composes two instances of that function
const asdSourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="asd-substation">
			<Private type="eIEC61850-6-100" ${id}="asd-substation-private">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-uuid" ${id}="application-source">
					<eIEC61850-6-100:FunctionRole name="ROOT" uuid="role-uuid" ${id}="role-source">
						<eIEC61850-6-100:FunctionRoleContent ${id}="role-content-source">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="function-uuid" ${id}="function-ref-source"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="asd-voltage-level">
				<Bay name="TEMPLATE" ${id}="asd-bay">
					<Function name="Prot" uuid="function-uuid" ${id}="function-source"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const projectComposingTwiceXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Substation name="S1" ${id}="project-substation">
			<VoltageLevel name="V1" ${id}="project-voltage-level">
				<Bay name="B1" ${id}="project-bay">
					<Private type="eIEC61850-6-100" ${id}="project-bay-private">
						<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="application-instance-uuid" templateUuid="application-uuid" ${id}="application-instance">
							<eIEC61850-6-100:FunctionRole name="ROOT" uuid="role-instance-uuid" templateUuid="role-uuid" ${id}="role-instance">
								<eIEC61850-6-100:FunctionRoleContent ${id}="role-content-instance">
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot" functionUuid="first-function-uuid" ${id}="first-function-ref"/>
									<eIEC61850-6-100:FunctionRef function="S1/V1/B1/Prot_1" functionUuid="second-function-uuid" ${id}="second-function-ref"/>
								</eIEC61850-6-100:FunctionRoleContent>
							</eIEC61850-6-100:FunctionRole>
						</eIEC61850-6-100:Application>
					</Private>
					<Function name="Prot" uuid="first-function-uuid" templateUuid="function-uuid" ${id}="first-function"/>
					<Function name="Prot_1" uuid="second-function-uuid" templateUuid="function-uuid" ${id}="second-function"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

type NoDecisionsTestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	lifecycle: (sourceQuery: Scl.Query) => LifecycleTarget
	/** How many times the same report is applied, each in its own transaction. */
	applies: number
	withoutDecisions: boolean
	expectedNeedsDecisions: boolean
}

describe('apply with no decisions: every group of the report at its suggested action', () => {
	const asdLifecycle = (sourceQuery: Scl.Query): LifecycleTarget => ({
		verb: 'asd',
		sourceQuery,
		ref: { tagName: 'Application', id: 'application-source' },
		anchor: { tagName: 'Bay', id: 'project-bay' },
		scenario: 'template',
	})
	const fsdLifecycle = (sourceQuery: Scl.Query): LifecycleTarget => ({
		verb: 'fsd',
		sourceQuery,
		ref: functionRef,
		anchor: bayRef,
	})

	const testCases: SclTest.TestCases<NoDecisionsTestCase> = {
		'an unchanged application composing its function twice keeps the reference the report kept': {
			sourceXml: asdSourceXml,
			targetXml: projectComposingTwiceXml,
			lifecycle: asdLifecycle,
			applies: 1,
			withoutDecisions: true,
			expectedNeedsDecisions: false,
			expectedQueries: [
				'//v2019C1:FunctionRef[@functionUuid="first-function-uuid"]',
				'//v2019C1:FunctionRef[@functionUuid="second-function-uuid"]',
			],
		},
		'the same with an empty decision map': {
			sourceXml: asdSourceXml,
			targetXml: projectComposingTwiceXml,
			lifecycle: asdLifecycle,
			applies: 1,
			withoutDecisions: false,
			expectedNeedsDecisions: false,
			expectedQueries: [
				'//v2019C1:FunctionRef[@functionUuid="first-function-uuid"]',
				'//v2019C1:FunctionRef[@functionUuid="second-function-uuid"]',
			],
		},
		'a first placement applied twice with no decisions places one function': {
			sourceXml,
			targetXml,
			lifecycle: fsdLifecycle,
			applies: 2,
			withoutDecisions: true,
			expectedNeedsDecisions: false,
			expectedQueries: ['//default:Bay[@name="B1"]/default:Function[@name="Prot"]'],
			unexpectedQueries: ['//default:Bay[@name="B1"]/default:Function[2]'],
		},
		'a first placement applied twice with an empty decision map places one function': {
			sourceXml,
			targetXml,
			lifecycle: fsdLifecycle,
			applies: 2,
			withoutDecisions: false,
			expectedNeedsDecisions: false,
			expectedQueries: ['//default:Bay[@name="B1"]/default:Function[@name="Prot"]'],
			unexpectedQueries: ['//default:Bay[@name="B1"]/default:Function[2]'],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<NoDecisionsTestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const lifecycle = testCase.lifecycle(source.query)

		const reported = await report(target.query, lifecycle)
		expect(reported.needsDecisions).toBe(testCase.expectedNeedsDecisions)
		for (let turn = 0; turn < testCase.applies; turn++) {
			await target.transaction(async function applyReport(tx) {
				await apply(tx, {
					...lifecycle,
					report: reported,
					...(testCase.withoutDecisions ? {} : { resolution: { decisions: new Map() } }),
				})
			})
		}

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
