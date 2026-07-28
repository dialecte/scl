import { asd as updateAsd } from './asd'

import { describe, expect, it } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	preInstantiate: boolean
	mutate?: (tx: Scl.Transaction) => Promise<void>
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

describe('update.asd (engine: instantiate-or-reconcile, application layer)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'reconciles onto the existing Application: updates in place + adds a role, no duplicate': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				await tx.update(applicationRef, { attributes: { type: 'DCS2' } })
				await tx.addChild(applicationRef, {
					tagName: 'FunctionRole',
					attributes: { name: 'ROLE2' },
				})
			},
			expectedQueries: [
				// the change lands on the SAME lineage-linked Application (updated in place)
				'//v2019C1:Application[@name="HMI"][@templateUuid="app-src-uuid"][@type="DCS2"]',
				'//v2019C1:Application[@name="HMI"]/v2019C1:FunctionRole[@name="ROLE2"]',
				'//v2019C1:Application[@name="HMI"]/v2019C1:FunctionRole[@name="ROOT"]',
			],
			unexpectedQueries: [
				// no stale duplicate: no Application left with the old type
				'//v2019C1:Application[@name="HMI"][@type="DCS"]',
			],
		},

		'cascades into the function layer: updates the composed Function body too': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				await tx.addChild({ tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '1', lnType: 'CSWI_Type' },
				})
			},
			expectedQueries: [
				// the composed function body (reference-linked under a Bay) is reconciled too
				'//default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]/default:LNode[@lnClass="XCBR"]',
				'//default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]/default:LNode[@lnClass="CSWI"]',
			],
		},

		'cascade instantiates a function newly added by the ASD (verbs compose verbs)': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				// the newer ASD composes a second function
				const newFunction = await tx.addChild({ tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>, {
					tagName: 'Function',
					attributes: { name: 'Prot2', uuid: 'fn2-src-uuid' },
				})
				await tx.addChild(newFunction, {
					tagName: 'LNode',
					attributes: { iedName: 'None', lnClass: 'CSWI', lnInst: '2', lnType: 'CSWI_Type' },
				})
				await tx.addChild(
					{ tagName: 'FunctionRoleContent', id: 'frc-s' } as Scl.Ref<'FunctionRoleContent'>,
					{
						tagName: 'FunctionRef',
						attributes: { function: 'TEMPLATE/Prot2', functionUuid: 'fn2-src-uuid' },
					},
				)
			},
			expectedQueries: [
				// the pre-existing composed function is still present
				'//default:Function[@name="Prot"][@templateUuid="fn-src-uuid"]',
				// the newly-added function is instantiated by the cascade (update.fsd fresh)
				'//default:Function[@name="Prot2"][@templateUuid="fn2-src-uuid"]',
			],
			unexpectedQueries: [
				// instance gets a fresh uuid; the source uuid survives only as templateUuid
				'//default:Function[@uuid="fn2-src-uuid"]',
			],
		},

		'deletes a role removed from the template': {
			sourceXml,
			targetXml,
			preInstantiate: true,
			mutate: async (tx) => {
				await tx.delete({ tagName: 'FunctionRole', id: 'fr-s' } as Scl.Ref<'FunctionRole'>)
			},
			expectedQueries: ['//v2019C1:Application[@name="HMI"][@templateUuid="app-src-uuid"]'],
			unexpectedQueries: ['//v2019C1:Application[@name="HMI"]/v2019C1:FunctionRole'],
		},

		'instantiates fresh when the target holds no Application yet (first-time = update auto)': {
			sourceXml,
			targetXml,
			preInstantiate: false,
			expectedQueries: ['//v2019C1:Application[@name="HMI"][@templateUuid="app-src-uuid"]'],
			unexpectedQueries: [
				// the instance receives a fresh uuid; the source uuid survives only as templateUuid
				'//v2019C1:Application[@uuid="app-src-uuid"]',
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
				await instantiateAsd(tx, {
					sourceQuery: source.query,
					applicationRef,
					targetParent: bayRef,
				})
			})
		}
		if (testCase.mutate) {
			await source.transaction(testCase.mutate)
		}
		await target.transaction(async (tx) => {
			await updateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('update.asd — returns the applied instance roots', () => {
	it('instantiate scenario: returns the new Application + its composed Function roots', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		let result: Awaited<ReturnType<typeof updateAsd>> | undefined
		await target.document.transaction(async (tx) => {
			result = await updateAsd(tx, {
				sourceQuery: source.document.query,
				applicationRef,
				targetParent: bayRef,
				scenario: 'instantiate',
			})
		})

		expect(result?.applications).toHaveLength(1)
		expect(result?.applications[0]?.tagName).toBe('Application')
		expect(result?.functions).toHaveLength(1)
		expect(result?.functions[0]?.tagName).toBe('Function')
	})

	it('gate: a matched instance whose groups are all skipped is not returned in applications', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')

		// one existing instance to reconcile against
		await target.document.transaction(async (tx) => {
			await instantiateAsd(tx, {
				sourceQuery: source.document.query,
				applicationRef,
				targetParent: bayRef,
			})
		})
		// the newer ASD adds a role, so there is exactly one diff group to skip
		await source.document.transaction(async (tx) => {
			await tx.addChild(applicationRef, {
				tagName: 'FunctionRole',
				attributes: { name: 'ROLE2' },
			})
		})

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})
		const decisions = new Map(allGroups(rep).map((g) => [g.id, 'skip'] as const)) as DecisionMap

		let result: Awaited<ReturnType<typeof updateAsd>> | undefined
		await target.document.transaction(async (tx) => {
			result = await updateAsd(tx, {
				sourceQuery: source.document.query,
				applicationRef,
				targetParent: bayRef,
				report: rep,
				decisions,
			})
		})

		// the instance was fully skipped -> nothing was written -> not an applied root
		expect(result?.applications).toHaveLength(0)
	})
})
