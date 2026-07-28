import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const variableRef = { tagName: 'Variable', id: 'var-s' } as Scl.Ref<'Variable'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	mutate: (tx: Scl.Transaction) => Promise<void>
	decide: (groups: DecisionGroup[]) => DecisionMap
}

// A Variable (cross-cutting satellite) that applies to the Application element
// itself — carried by the application primary, not the composed-function cascade.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Variable name="AppTag" value="HMI1" uuid="var-src-uuid" ${id}="var-s">
					<eIEC61850-6-100:VariableApplyTo element="TEMPLATE" elementUuid="app-src-uuid" ${id}="vat-s"/>
				</eIEC61850-6-100:Variable>
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
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid"/>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

const skipAll =
	() =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.map((g) => [g.id, 'skip'] as const))

const mutate = async (tx: Scl.Transaction): Promise<void> => {
	await tx.update(applicationRef, { attributes: { desc: 'updated application' } })
	await tx.update(variableRef, { attributes: { desc: 'updated variable' } })
}

describe('lifecycle.apply — carried Variable applying to the Application (cross-cutting satellite)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accepting the application group also updates the Variable that applies to it': {
			sourceXml,
			targetXml,
			mutate,
			decide: () => new Map(),
			expectedQueries: [
				'//v2019C1:Application[@name="HMI"][@desc="updated application"]',
				'//v2019C1:Variable[@templateUuid="var-src-uuid"][@desc="updated variable"]',
			],
		},

		'skipping the application group leaves the Variable untouched': {
			sourceXml,
			targetXml,
			mutate,
			decide: skipAll(),
			unexpectedQueries: [
				'//v2019C1:Application[@desc="updated application"]',
				'//v2019C1:Variable[@desc="updated variable"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})
		await source.transaction(testCase.mutate)

		const rep = await report(target.query, {
			verb: 'asd',
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'asd',
				sourceQuery: source.query,
				ref: applicationRef,
				anchor: bayRef,
				report: rep,
				decisions: testCase.decide(allGroups(rep)),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
